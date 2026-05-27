import type { MessageStatus, Prisma, PrismaClient, ProviderCode } from "../../generated/prisma/client.js";

const adminMessageInclude = {
  deliveries: {
    include: {
      provider: true,
      target: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} as const;

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

export type AdminReportingMessage = Prisma.MessageGetPayload<{
  include: typeof adminMessageInclude;
}>;

export type AdminReportingUser = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

export type AdminReportingDailyUsage = Prisma.DailyUsageGetPayload<{
  select: typeof dailyUsageSelect;
}>;

export type AdminReportingMessageFilters = {
  userId?: string;
  status?: MessageStatus;
  provider?: ProviderCode;
  from?: Date;
  to?: Date;
};

export type AdminReportingMessageCount = {
  userId: string;
  count: number;
};

export class AdminReportingRepository {
  constructor(private readonly db: PrismaClient) {}

  listMessages(filters: AdminReportingMessageFilters): Promise<AdminReportingMessage[]> {
    const where: Prisma.MessageWhereInput = {
      ...(filters.userId === undefined ? {} : { userId: filters.userId }),
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.from === undefined && filters.to === undefined
        ? {}
        : {
            createdAt: {
              ...(filters.from === undefined ? {} : { gte: filters.from }),
              ...(filters.to === undefined ? {} : { lte: filters.to }),
            },
          }),
      ...(filters.provider === undefined
        ? {}
        : {
            deliveries: {
              some: {
                provider: {
                  code: filters.provider,
                },
              },
            },
          }),
    };

    return this.db.message.findMany({
      where,
      include: adminMessageInclude,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  listUsers(): Promise<AdminReportingUser[]> {
    return this.db.user.findMany({
      select: adminUserSelect,
      orderBy: [{ createdAt: "asc" }, { email: "asc" }, { id: "asc" }],
    });
  }

  async countMessagesByUser(): Promise<AdminReportingMessageCount[]> {
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

  listDailyUsageForDate(usageDate: Date): Promise<AdminReportingDailyUsage[]> {
    return this.db.dailyUsage.findMany({
      where: {
        usageDate,
      },
      select: dailyUsageSelect,
    });
  }
}
