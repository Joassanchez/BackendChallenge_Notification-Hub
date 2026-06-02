import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { AppError, tooManyRequests } from "../src/shared/http/errors.js";
import {
  RateLimitRepository,
  type DailyUsageSnapshot,
} from "../src/modules/quota/rate-limiting/rate-limit.repository.js";
import {
  RateLimitService,
  toUtcUsageDate,
} from "../src/modules/quota/rate-limiting/rate-limit.service.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

async function importEnvWithDailyLimit(value: string | undefined) {
  vi.resetModules();
  // DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT already set by vitest.setup.ts
  // via .env.test; do not override them.

  if (value === undefined) {
    process.env.DAILY_MESSAGE_LIMIT = "";
  } else {
    process.env.DAILY_MESSAGE_LIMIT = value;
  }

  return import("../src/shared/config/env.js");
}

function createMockTx(
  scenario:
    | "update-success"
    | "create-success"
    | "create-conflict-then-update"
    | "limit-reached",
) {
  const updateMany = vi.fn();
  const create = vi.fn();
  const findUnique = vi.fn();

  const usageDate = new Date("2026-05-26T00:00:00.000Z");
  const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";

  switch (scenario) {
    case "update-success":
      updateMany.mockResolvedValue({ count: 1 });
      findUnique.mockResolvedValue({
        userId,
        usageDate,
        sentCount: 1,
        dailyLimit: 2,
      });
      break;

    case "create-success":
      updateMany.mockResolvedValue({ count: 0 });
      create.mockResolvedValue({
        userId,
        usageDate,
        sentCount: 1,
        dailyLimit: 2,
        id: "ignored-uuid",
        createdAt: usageDate,
        updatedAt: usageDate,
      });
      break;

    case "create-conflict-then-update":
      updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`user_id`,`usage_date`)",
          {
            code: "P2002",
            clientVersion: "7.8.0",
          },
        ),
      );
      findUnique.mockResolvedValue({
        userId,
        usageDate,
        sentCount: 2,
        dailyLimit: 2,
      });
      break;

    case "limit-reached":
      updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`user_id`,`usage_date`)",
          {
            code: "P2002",
            clientVersion: "7.8.0",
          },
        ),
      );
      break;
  }

  const dailyUsage = { updateMany, create, findUnique };
  const tx = { dailyUsage } as unknown as Prisma.TransactionClient;
  return { tx, dailyUsage };
}

describe("Rate limiting foundation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads DAILY_MESSAGE_LIMIT as a positive integer and defaults to 100", async () => {
    await expect(importEnvWithDailyLimit("7")).resolves.toMatchObject({
      env: expect.objectContaining({ DAILY_MESSAGE_LIMIT: 7 }),
    });

    await expect(importEnvWithDailyLimit(undefined)).resolves.toMatchObject({
      env: expect.objectContaining({ DAILY_MESSAGE_LIMIT: 100 }),
    });
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "rejects invalid DAILY_MESSAGE_LIMIT=%s",
    async (value) => {
      await expect(importEnvWithDailyLimit(value)).rejects.toThrow(
        "Environment variable DAILY_MESSAGE_LIMIT must be a positive integer",
      );
    },
  );

  it("maps quota exhaustion to a controlled 429 error", () => {
    const error = tooManyRequests();

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.message).toBe("Daily message limit exceeded");
  });

  it("calculates usage dates at UTC midnight and reports zero usage when no row exists", async () => {
    const rateLimits = {
      reserveDailyQuota: vi.fn(),
      findCurrentUsage: vi.fn().mockResolvedValue(null),
    };
    const service = new RateLimitService(rateLimits, 3);
    const usageDate = toUtcUsageDate(new Date("2026-05-26T23:59:59.000-03:00"));

    expect(usageDate.toISOString()).toBe("2026-05-27T00:00:00.000Z");

    const report = await service.getReport(
      "user-id",
      new Date("2026-05-26T23:59:59.000-03:00"),
    );

    expect(rateLimits.findCurrentUsage).toHaveBeenCalledWith(
      "user-id",
      usageDate,
    );
    expect(report).toEqual({
      usageDate: "2026-05-27",
      dailyLimit: 3,
      usedToday: 0,
      remainingToday: 3,
    });
  });

  it("reports persisted usage without negative remaining quota", async () => {
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const rateLimits = {
      reserveDailyQuota: vi.fn(),
      findCurrentUsage: vi.fn().mockResolvedValue({
        sentCount: 5,
        dailyLimit: 5,
        usageDate,
        userId: "user-id",
      }),
    };
    const service = new RateLimitService(rateLimits, 3);

    await expect(service.getReport("user-id", usageDate)).resolves.toEqual({
      usageDate: "2026-05-26",
      dailyLimit: 3,
      usedToday: 5,
      remainingToday: 0,
    });
  });

  it("reserves one quota unit through the repository for the UTC usage date", async () => {
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const rateLimits = {
      reserveDailyQuota: vi.fn().mockResolvedValue({
        userId: "user-id",
        usageDate,
        sentCount: 1,
        dailyLimit: 2,
      }),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 2);
    const { tx } = createMockTx("update-success");

    await service.reserveMessage(
      tx,
      "user-id",
      new Date("2026-05-26T10:00:00.000Z"),
    );

    expect(rateLimits.reserveDailyQuota).toHaveBeenCalledWith({
      tx,
      userId: "user-id",
      usageDate,
      dailyLimit: 2,
    });
  });

  it("uses the current UTC day when reserving quota without an explicit clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T23:30:00.000-03:00"));
    const rateLimits = {
      reserveDailyQuota: vi.fn().mockResolvedValue({
        userId: "user-id",
        usageDate: new Date("2026-05-27T00:00:00.000Z"),
        sentCount: 1,
        dailyLimit: 4,
      }),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 4);
    const { tx } = createMockTx("update-success");

    await service.reserveMessage(tx, "user-id");

    expect(rateLimits.reserveDailyQuota).toHaveBeenCalledWith({
      tx,
      userId: "user-id",
      usageDate: new Date("2026-05-27T00:00:00.000Z"),
      dailyLimit: 4,
    });
  });

  it("does not mutate quota while reading the current report", async () => {
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const rateLimits = {
      reserveDailyQuota: vi.fn(),
      findCurrentUsage: vi.fn().mockResolvedValue({
        sentCount: 2,
        dailyLimit: 3,
        usageDate,
        userId: "user-id",
      }),
    };
    const service = new RateLimitService(rateLimits, 3);

    await expect(service.getReport("user-id", usageDate)).resolves.toEqual({
      usageDate: "2026-05-26",
      dailyLimit: 3,
      usedToday: 2,
      remainingToday: 1,
    });
    expect(rateLimits.reserveDailyQuota).not.toHaveBeenCalled();
  });

  it("propagates unexpected repository failures instead of rewriting them as quota exhaustion", async () => {
    const databaseError = new Error("database unavailable");
    const rateLimits = {
      reserveDailyQuota: vi.fn().mockRejectedValue(databaseError),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 1);
    const { tx } = createMockTx("update-success");

    await expect(
      service.reserveMessage(
        tx,
        "user-id",
        new Date("2026-05-26T10:00:00.000Z"),
      ),
    ).rejects.toBe(databaseError);
  });

  it("throws RATE_LIMIT_EXCEEDED when reservation returns no row", async () => {
    const rateLimits = {
      reserveDailyQuota: vi.fn().mockResolvedValue(null),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 1);
    const { tx } = createMockTx("update-success");

    await expect(
      service.reserveMessage(
        tx,
        "user-id",
        new Date("2026-05-26T10:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  // ─── Phase 1 RED: scenario tests for Prisma-native reserveDailyQuota ───

  it("reserves quota via updateMany when a row already exists below the limit", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, dailyUsage } = createMockTx("update-success");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(dailyUsage.updateMany).toHaveBeenCalledWith({
      where: { userId, usageDate, sentCount: { lt: 2 } },
      data: { sentCount: { increment: 1 }, dailyLimit: 2 },
    });
    expect(dailyUsage.findUnique).toHaveBeenCalledWith({
      where: { userId_usageDate: { userId, usageDate } },
    });
    expect(dailyUsage.create).not.toHaveBeenCalled();
    expect(result).toEqual({ userId, usageDate, sentCount: 1, dailyLimit: 2 });
  });

  it("creates a row and reserves one unit when no daily usage row exists", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, dailyUsage } = createMockTx("create-success");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(dailyUsage.updateMany).toHaveBeenCalledWith({
      where: { userId, usageDate, sentCount: { lt: 2 } },
      data: { sentCount: { increment: 1 }, dailyLimit: 2 },
    });
    expect(dailyUsage.create).toHaveBeenCalledWith({
      data: { userId, usageDate, sentCount: 1, dailyLimit: 2 },
    });
    expect(dailyUsage.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({ userId, usageDate, sentCount: 1, dailyLimit: 2 });
  });

  it("retries via updateMany when create hits a unique constraint from a concurrent insert", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, dailyUsage } = createMockTx("create-conflict-then-update");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    // First attempt
    expect(dailyUsage.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId, usageDate, sentCount: { lt: 2 } },
      data: { sentCount: { increment: 1 }, dailyLimit: 2 },
    });
    expect(dailyUsage.create).toHaveBeenCalledWith({
      data: { userId, usageDate, sentCount: 1, dailyLimit: 2 },
    });
    // Retry after P2002
    expect(dailyUsage.updateMany).toHaveBeenNthCalledWith(2, {
      where: { userId, usageDate, sentCount: { lt: 2 } },
      data: { sentCount: { increment: 1 }, dailyLimit: 2 },
    });
    expect(dailyUsage.findUnique).toHaveBeenCalledWith({
      where: { userId_usageDate: { userId, usageDate } },
    });
    expect(result).toEqual({ userId, usageDate, sentCount: 2, dailyLimit: 2 });
  });

  it("returns null when the limit is reached even after an insert conflict retry", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, dailyUsage } = createMockTx("limit-reached");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(dailyUsage.updateMany).toHaveBeenCalledTimes(2);
    expect(dailyUsage.create).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
