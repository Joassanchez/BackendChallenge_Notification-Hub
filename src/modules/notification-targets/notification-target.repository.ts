import { Prisma, type PrismaClient, type ProviderCode } from "../../generated/prisma/client.js";

const targetWithProvider = {
  provider: true,
} as const;

export type NotificationTargetWithProvider = Prisma.NotificationTargetGetPayload<{
  include: typeof targetWithProvider;
}>;

export type CreateNotificationTargetData = {
  userId: string;
  providerId: string;
  providerConnectionId: string;
  externalTargetId: string;
  targetType: string;
  displayName?: string | null | undefined;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
};

export type UpdateNotificationTargetData = {
  displayName?: string | null | undefined;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
};

export class NotificationTargetRepository {
  constructor(private readonly db: PrismaClient) {}

  listForUser(userId: string) {
    return this.db.notificationTarget.findMany({
      where: {
        userId,
      },
      include: targetWithProvider,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  findProviderByCode(code: ProviderCode) {
    return this.db.provider.findUnique({
      where: {
        code,
      },
    });
  }

  findActiveConnectionsForProvider(providerId: string) {
    return this.db.providerConnection.findMany({
      where: {
        providerId,
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  findActiveDuplicate(input: {
    userId: string;
    providerId: string;
    externalTargetId: string;
    targetType: string;
    excludeId?: string;
  }) {
    return this.db.notificationTarget.findFirst({
      where: {
        userId: input.userId,
        providerId: input.providerId,
        externalTargetId: input.externalTargetId,
        targetType: input.targetType,
        isActive: true,
        ...(input.excludeId === undefined ? {} : { NOT: { id: input.excludeId } }),
      },
    });
  }

  create(data: CreateNotificationTargetData) {
    const createData: Prisma.NotificationTargetUncheckedCreateInput = {
      userId: data.userId,
      providerId: data.providerId,
      providerConnectionId: data.providerConnectionId,
      externalTargetId: data.externalTargetId,
      targetType: data.targetType,
      ...(data.displayName === undefined ? {} : { displayName: data.displayName }),
      ...(data.metadata === undefined ? {} : { metadata: data.metadata }),
    };

    return this.db.notificationTarget.create({
      data: createData,
      include: targetWithProvider,
    });
  }

  findForUser(userId: string, targetId: string) {
    return this.db.notificationTarget.findFirst({
      where: {
        id: targetId,
        userId,
      },
      include: targetWithProvider,
    });
  }

  updateForUser(userId: string, targetId: string, data: UpdateNotificationTargetData) {
    const updateData: Prisma.NotificationTargetUncheckedUpdateInput = {
      ...(data.displayName === undefined ? {} : { displayName: data.displayName }),
      ...(data.metadata === undefined ? {} : { metadata: data.metadata }),
    };

    return this.db.notificationTarget.update({
      where: {
        id: targetId,
        userId,
      },
      data: updateData,
      include: targetWithProvider,
    });
  }

  setActiveForUser(userId: string, targetId: string, isActive: boolean) {
    return this.db.notificationTarget.update({
      where: {
        id: targetId,
        userId,
      },
      data: {
        isActive,
      },
      include: targetWithProvider,
    });
  }
}
