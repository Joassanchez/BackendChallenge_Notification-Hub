import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";

const adminUserSelect = {
  id: true,
  email: true,
  username: true,
  createdAt: true,
} as const;

const dailyUsageSelect = {
  userId: true,
  usageDate: true,
  sentCount: true,
  dailyLimit: true,
} as const;

export type AdminMetricsUser = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

export type AdminMetricsDailyUsage = Prisma.DailyUsageGetPayload<{
  select: typeof dailyUsageSelect;
}>;

export type AdminMetricsMessageCount = {
  userId: string;
  count: number;
};

export class AdminMetricsRepository {
  constructor(private readonly db: PrismaClient) {}

  listUsers(): Promise<AdminMetricsUser[]> {
    return this.db.user.findMany({
      select: adminUserSelect,
      orderBy: [{ createdAt: "asc" }, { email: "asc" }, { id: "asc" }],
    });
  }

  async countMessagesByUser(): Promise<AdminMetricsMessageCount[]> {
    const counts = await this.db.message.groupBy({
      by: ["userId"],
      _count: {
        _all: true,
      },
    });

    return counts.map((count) => ({
      userId: count.userId,
      count: count._count._all,
    }));
  }

  listDailyUsageForDate(usageDate: Date): Promise<AdminMetricsDailyUsage[]> {
    return this.db.dailyUsage.findMany({
      where: {
        usageDate,
      },
      select: dailyUsageSelect,
    });
  }
}
