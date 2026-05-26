import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { randomUUID } from "node:crypto";

export type DailyUsageSnapshot = {
  userId: string;
  usageDate: Date;
  sentCount: number;
  dailyLimit: number;
};

export class RateLimitRepository {
  constructor(private readonly db: PrismaClient) {}

  findCurrentUsage(userId: string, usageDate: Date) {
    return this.db.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate,
        },
      },
    });
  }

  async reserveDailyQuota(input: {
    tx: Prisma.TransactionClient;
    userId: string;
    usageDate: Date;
    dailyLimit: number;
  }): Promise<DailyUsageSnapshot | null> {
    const reserved = await input.tx.$queryRaw<DailyUsageSnapshot[]>`
      INSERT INTO daily_usage (id, user_id, usage_date, sent_count, daily_limit, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${input.userId}::uuid, ${input.usageDate}, 1, ${input.dailyLimit}, NOW(), NOW())
      ON CONFLICT (user_id, usage_date)
      DO UPDATE SET
        sent_count = daily_usage.sent_count + 1,
        daily_limit = EXCLUDED.daily_limit,
        updated_at = NOW()
      WHERE daily_usage.sent_count < ${input.dailyLimit}
      RETURNING
        user_id AS "userId",
        usage_date AS "usageDate",
        sent_count AS "sentCount",
        daily_limit AS "dailyLimit"
    `;

    return reserved[0] ?? null;
  }
}
