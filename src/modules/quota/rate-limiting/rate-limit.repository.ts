import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";

export type DailyUsageSnapshot = {
  userId: string;
  usageDate: Date;
  sentCount: number;
  dailyLimit: number;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toDailyUsageSnapshot(dailyUsage: {
  userId: string;
  usageDate: Date;
  sentCount: number;
  dailyLimit: number;
}): DailyUsageSnapshot {
  return {
    userId: dailyUsage.userId,
    usageDate: dailyUsage.usageDate,
    sentCount: dailyUsage.sentCount,
    dailyLimit: dailyUsage.dailyLimit,
  };
}

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

    const where = {
      userId,
      usageDate,
      sentCount: { lt: dailyLimit },
    };

    const updateResult = await tx.dailyUsage.updateMany({
      where,
      data: { sentCount: { increment: 1 }, dailyLimit },
    });

    // Existing row was updated — fetch snapshot and return.
    if (updateResult.count === 1) {
      const snapshot = await tx.dailyUsage.findUnique({
        where: { userId_usageDate: { userId, usageDate } },
      });
      // findUnique cannot return null here because the row just matched updateMany's WHERE.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return toDailyUsageSnapshot(snapshot!);
    }

    // No matching row — try creating one.
    try {
      const created = await tx.dailyUsage.create({
        data: { userId, usageDate, sentCount: 1, dailyLimit },
      });
      return toDailyUsageSnapshot(created);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      // Row was concurrently inserted — retry updateMany.
      const retryResult = await tx.dailyUsage.updateMany({
        where,
        data: { sentCount: { increment: 1 }, dailyLimit },
      });

      if (retryResult.count === 1) {
        const snapshot = await tx.dailyUsage.findUnique({
          where: { userId_usageDate: { userId, usageDate } },
        });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return toDailyUsageSnapshot(snapshot!);
      }

      // Limit reached — the existing row has sentCount >= dailyLimit.
      return null;
    }
  }
}
