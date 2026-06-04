import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";

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
    const { tx, userId, usageDate, dailyLimit } = input;

    const rows = await tx.$queryRaw<DailyUsageSnapshot[]>`
      INSERT INTO daily_usage (id, user_id, usage_date, sent_count, daily_limit, created_at, updated_at)
      VALUES (${crypto.randomUUID()}::uuid, ${userId}::uuid, ${usageDate}::date, 1, ${dailyLimit}, now(), now())
      ON CONFLICT (user_id, usage_date)
      DO UPDATE SET
        sent_count = daily_usage.sent_count + 1,
        daily_limit = EXCLUDED.daily_limit,
        updated_at = now()
      WHERE daily_usage.sent_count < ${dailyLimit}
      RETURNING user_id AS "userId", usage_date AS "usageDate", sent_count AS "sentCount", daily_limit AS "dailyLimit"
    `;

    return rows[0] ?? null;
  }
}
