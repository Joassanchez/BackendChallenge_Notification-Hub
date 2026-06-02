import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { AppError, tooManyRequests } from "../src/shared/http/errors.js";
import { RateLimitRepository, type DailyUsageSnapshot } from "../src/modules/quota/rate-limiting/rate-limit.repository.js";
import { RateLimitService, toUtcUsageDate } from "../src/modules/quota/rate-limiting/rate-limit.service.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function createTransactionReturning(rows: DailyUsageSnapshot[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      calls.push({ sql: strings.join("?"), values });
      return Promise.resolve(rows);
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, calls };
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

  it.each(["0", "-1", "1.5", "abc"])("rejects invalid DAILY_MESSAGE_LIMIT=%s", async (value) => {
    await expect(importEnvWithDailyLimit(value)).rejects.toThrow("Environment variable DAILY_MESSAGE_LIMIT must be a positive integer");
  });

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

    const report = await service.getReport("user-id", new Date("2026-05-26T23:59:59.000-03:00"));

    expect(rateLimits.findCurrentUsage).toHaveBeenCalledWith("user-id", usageDate);
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
      findCurrentUsage: vi.fn().mockResolvedValue({ sentCount: 5, dailyLimit: 5, usageDate, userId: "user-id" }),
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
      reserveDailyQuota: vi.fn().mockResolvedValue({ userId: "user-id", usageDate, sentCount: 1, dailyLimit: 2 }),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 2);
    const { tx } = createTransactionReturning([]);

    await service.reserveMessage(tx, "user-id", new Date("2026-05-26T10:00:00.000Z"));

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
    const { tx } = createTransactionReturning([]);

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
      findCurrentUsage: vi.fn().mockResolvedValue({ sentCount: 2, dailyLimit: 3, usageDate, userId: "user-id" }),
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
    const { tx } = createTransactionReturning([]);

    await expect(service.reserveMessage(tx, "user-id", new Date("2026-05-26T10:00:00.000Z"))).rejects.toBe(databaseError);
  });

  it("throws RATE_LIMIT_EXCEEDED when reservation returns no row", async () => {
    const rateLimits = {
      reserveDailyQuota: vi.fn().mockResolvedValue(null),
      findCurrentUsage: vi.fn(),
    };
    const service = new RateLimitService(rateLimits, 1);
    const { tx } = createTransactionReturning([]);

    await expect(service.reserveMessage(tx, "user-id", new Date("2026-05-26T10:00:00.000Z"))).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("uses a single PostgreSQL upsert with a conditional update for atomic quota reservation", async () => {
    const repository = new RateLimitRepository({} as never);
    const usageDate = new Date("2026-05-26T00:00:00.000Z");
    const row = { userId: "3f7fb862-e9c6-4696-8b59-76fdf56d4975", usageDate, sentCount: 1, dailyLimit: 2 };
    const { tx, calls } = createTransactionReturning([row]);

    await expect(
      repository.reserveDailyQuota({ tx, userId: row.userId, usageDate, dailyLimit: 2 }),
    ).resolves.toEqual(row);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("INSERT INTO daily_usage (id, user_id, usage_date, sent_count, daily_limit, created_at, updated_at)");
    expect(calls[0]?.sql).toContain("ON CONFLICT (user_id, usage_date)");
    expect(calls[0]?.sql).toContain("WHERE daily_usage.sent_count <");
    expect(calls[0]?.sql).toContain("RETURNING");
    expect(calls[0]?.values).toEqual([expect.stringMatching(uuidPattern), row.userId, usageDate, 2, 2]);
  });

  it("returns null when the atomic reservation statement does not return a row", async () => {
    const repository = new RateLimitRepository({} as never);
    const { tx } = createTransactionReturning([]);

    await expect(
      repository.reserveDailyQuota({
        tx,
        userId: "3f7fb862-e9c6-4696-8b59-76fdf56d4975",
        usageDate: new Date("2026-05-26T00:00:00.000Z"),
        dailyLimit: 1,
      }),
    ).resolves.toBeNull();
  });
});
