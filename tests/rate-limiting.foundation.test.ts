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
  scenario: "upsert-returns-row" | "upsert-returns-empty",
) {
  const queryRaw = vi.fn();

  const usageDate = new Date("2026-05-26T00:00:00.000Z");
  const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";

  switch (scenario) {
    case "upsert-returns-row":
      queryRaw.mockResolvedValue([
        { userId, usageDate, sentCount: 1, dailyLimit: 2 },
      ]);
      break;

    case "upsert-returns-empty":
      queryRaw.mockResolvedValue([]);
      break;
  }

  const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
  return { tx, queryRaw };
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
    const { tx } = createMockTx("upsert-returns-row");

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
    const { tx } = createMockTx("upsert-returns-row");

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
    const { tx } = createMockTx("upsert-returns-row");

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
    const { tx } = createMockTx("upsert-returns-row");

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

  // ─── Phase 2 RED/GREEN: scenario tests for $queryRaw-based reserveDailyQuota ───

  it("$queryRaw returns a row → method returns DailyUsageSnapshot", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, queryRaw } = createMockTx("upsert-returns-row");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ userId, usageDate, sentCount: 1, dailyLimit: 2 });
  });

  it("$queryRaw returns another row → method returns updated DailyUsageSnapshot", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";

    const queryRaw = vi.fn().mockResolvedValue([
      { userId, usageDate, sentCount: 2, dailyLimit: 2 },
    ]);
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ userId, usageDate, sentCount: 2, dailyLimit: 2 });
  });

  it("$queryRaw returns [] → method returns null", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const userId = "3f7fb862-e9c6-4696-8b59-76fdf56d4975";
    const { tx, queryRaw } = createMockTx("upsert-returns-empty");

    const result = await repository.reserveDailyQuota({
      tx,
      userId,
      usageDate,
      dailyLimit: 2,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
