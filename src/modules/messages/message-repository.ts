import type { Prisma, PrismaClient, ProviderCode } from "../../generated/prisma/client.js";
import { badRequest } from "../../shared/http/errors.js";

const messageWithDeliveries = {
  deliveries: {
    include: {
      provider: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} as const;

export type MessageWithDeliveries = Prisma.MessageGetPayload<{
  include: typeof messageWithDeliveries;
}>;

export type NormalizedDestination = {
  provider: ProviderCode;
  targetId: string;
};

export type MessageListFilters = {
  status?: Prisma.MessageWhereInput["status"];
  provider?: ProviderCode;
  from?: Date;
  to?: Date;
};

type TargetForDestination = {
  id: string;
  providerId: string;
  provider: {
    code: ProviderCode;
    isActive: boolean;
  };
};

export class MessageRepository {
  constructor(private readonly db: PrismaClient) {}

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.db.message.findFirst({
      where: {
        userId,
        idempotencyKey,
      },
      include: messageWithDeliveries,
    });
  }

  findByIdForUser(userId: string, messageId: string) {
    return this.db.message.findFirst({
      where: {
        id: messageId,
        userId,
      },
      include: messageWithDeliveries,
    });
  }

  listForUser(userId: string, filters: MessageListFilters) {
    return this.db.message.findMany({
      where: {
        userId,
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
      },
      include: messageWithDeliveries,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  createPendingMessage(input: {
    userId: string;
    content: string;
    destinations: NormalizedDestination[];
    idempotencyKey?: string;
  }) {
    return this.db.$transaction(async (transaction) => {
      const targets = await transaction.notificationTarget.findMany({
        where: {
          id: {
            in: input.destinations.map((destination) => destination.targetId),
          },
          userId: input.userId,
          isActive: true,
        },
        include: {
          provider: true,
        },
      });

      const deliveryData = input.destinations.map((destination) => {
        const target = findMatchingTarget(targets, destination);

        if (target === undefined) {
          throw badRequest("Invalid destination");
        }

        return {
          providerId: target.providerId,
          targetId: target.id,
        };
      });

      return transaction.message.create({
        data: {
          userId: input.userId,
          content: input.content,
          idempotencyKey: input.idempotencyKey ?? null,
          deliveries: {
            create: deliveryData,
          },
        },
        include: messageWithDeliveries,
      });
    });
  }
}

function findMatchingTarget(targets: TargetForDestination[], destination: NormalizedDestination): TargetForDestination | undefined {
  return targets.find(
    (target) => target.id === destination.targetId && target.provider.code === destination.provider && target.provider.isActive,
  );
}
