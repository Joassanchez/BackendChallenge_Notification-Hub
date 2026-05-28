import type { MessageStatus, Prisma, PrismaClient, ProviderCode } from "../../../generated/prisma/client.js";

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

export type AdminReportingMessage = Prisma.MessageGetPayload<{
  include: typeof adminMessageInclude;
}>;

export type AdminReportingMessageFilters = {
  userId?: string;
  status?: MessageStatus;
  provider?: ProviderCode;
  from?: Date;
  to?: Date;
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
}
