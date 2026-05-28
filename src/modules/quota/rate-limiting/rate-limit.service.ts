import { env } from "../../../shared/config/env.js";
import { tooManyRequests } from "../../../shared/http/errors.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { RateLimitRepository } from "./rate-limit.repository.js";

export type RateLimitReport = {
  usageDate: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
};

type RateLimitStore = Pick<RateLimitRepository, "reserveDailyQuota" | "findCurrentUsage">;

export class RateLimitService {
  constructor(
    private readonly rateLimits: RateLimitStore,
    private readonly dailyLimit = env.DAILY_MESSAGE_LIMIT,
  ) {}

  async reserveMessage(tx: Prisma.TransactionClient, userId: string, now = new Date()): Promise<void> {
    const reserved = await this.rateLimits.reserveDailyQuota({
      tx,
      userId,
      usageDate: toUtcUsageDate(now),
      dailyLimit: this.dailyLimit,
    });

    if (reserved === null) {
      throw tooManyRequests();
    }
  }

  async getReport(userId: string, now = new Date()): Promise<RateLimitReport> {
    const usageDate = toUtcUsageDate(now);
    const usage = await this.rateLimits.findCurrentUsage(userId, usageDate);
    const usedToday = usage?.sentCount ?? 0;

    return {
      usageDate: formatUsageDate(usageDate),
      dailyLimit: this.dailyLimit,
      usedToday,
      remainingToday: Math.max(this.dailyLimit - usedToday, 0),
    };
  }
}

export function toUtcUsageDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatUsageDate(usageDate: Date): string {
  return usageDate.toISOString().slice(0, 10);
}
