import {
  AttemptStatus,
  DeliveryStatus,
  MessageStatus,
  Prisma,
  type PrismaClient,
  type ProviderCode,
} from "../../../generated/prisma/client.js";

const deliveryWithIncludes = {
  message: true,
  provider: true,
  target: {
    include: {
      providerConnection: true,
    },
  },
} as const;

const executableDeliveryInclude = {
  message: true,
  provider: true,
  target: {
    include: {
      providerConnection: true,
    },
  },
} as const;

export type ExecutableDelivery = Prisma.MessageDeliveryGetPayload<{
  include: typeof executableDeliveryInclude;
}>;

export type DeliveryAttemptWrite = {
  status: AttemptStatus;
  httpStatusCode?: number | null;
  providerMessageId?: string | null;
  providerResponse?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type CompleteDeliveryInput = {
  deliveryId: string;
  deliveryStatus: typeof DeliveryStatus.success | typeof DeliveryStatus.failed;
  attempt: DeliveryAttemptWrite;
};

export type MarkRetryingInput = {
  deliveryId: string;
  attempt: DeliveryAttemptWrite;
  nextRetryAt: Date;
};

export class DeliveryExecutionRepository {
  constructor(private readonly db: PrismaClient) {}

  findPendingDeliveriesForMessage(messageId: string) {
    return this.db.messageDelivery.findMany({
      where: {
        messageId,
        status: DeliveryStatus.pending,
      },
      include: executableDeliveryInclude,
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  markProcessing(deliveryId: string) {
    return this.db.messageDelivery.update({
      where: {
        id: deliveryId,
      },
      data: {
        status: DeliveryStatus.processing,
      },
    });
  }

  completeDelivery(input: CompleteDeliveryInput) {
    return this.db.$transaction(async (transaction) => {
      const delivery = await transaction.messageDelivery.findUniqueOrThrow({
        where: {
          id: input.deliveryId,
        },
        select: {
          messageId: true,
          attemptCount: true,
        },
      });

      await transaction.deliveryAttempt.create({
        data: {
          deliveryId: input.deliveryId,
          attemptNumber: delivery.attemptCount + 1,
          status: input.attempt.status,
          httpStatusCode: input.attempt.httpStatusCode ?? null,
          providerMessageId: input.attempt.providerMessageId ?? null,
          providerResponse: input.attempt.providerResponse ?? Prisma.JsonNull,
          errorCode: input.attempt.errorCode ?? null,
          errorMessage: input.attempt.errorMessage ?? null,
        },
      });

      await transaction.messageDelivery.update({
        where: {
          id: input.deliveryId,
        },
        data: {
          status: input.deliveryStatus,
          attemptCount: {
            increment: 1,
          },
          nextRetryAt: null,
          sentAt: input.deliveryStatus === DeliveryStatus.success ? new Date() : null,
        },
      });

      const aggregateStatus = await calculateMessageStatus(transaction, delivery.messageId);

      return transaction.message.update({
        where: {
          id: delivery.messageId,
        },
        data: {
          status: aggregateStatus,
        },
      });
    });
  }

  markRetrying(input: MarkRetryingInput) {
    return this.db.$transaction(async (transaction) => {
      const delivery = await transaction.messageDelivery.findUniqueOrThrow({
        where: {
          id: input.deliveryId,
        },
        select: {
          messageId: true,
          attemptCount: true,
        },
      });

      await transaction.deliveryAttempt.create({
        data: {
          deliveryId: input.deliveryId,
          attemptNumber: delivery.attemptCount + 1,
          status: input.attempt.status,
          httpStatusCode: input.attempt.httpStatusCode ?? null,
          providerMessageId: input.attempt.providerMessageId ?? null,
          providerResponse: input.attempt.providerResponse ?? Prisma.JsonNull,
          errorCode: input.attempt.errorCode ?? null,
          errorMessage: input.attempt.errorMessage ?? null,
        },
      });

      await transaction.messageDelivery.update({
        where: {
          id: input.deliveryId,
        },
        data: {
          status: DeliveryStatus.retrying,
          attemptCount: {
            increment: 1,
          },
          nextRetryAt: input.nextRetryAt,
          sentAt: null,
        },
      });

      const aggregateStatus = await calculateMessageStatus(transaction, delivery.messageId);

      return transaction.message.update({
        where: {
          id: delivery.messageId,
        },
        data: {
          status: aggregateStatus,
        },
      });
    });
  }

  async claimRetry(deliveryId: string): Promise<ExecutableDelivery | null> {
    const result = await this.db.messageDelivery.updateMany({
      where: {
        id: deliveryId,
        status: DeliveryStatus.retrying,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: DeliveryStatus.processing,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.db.messageDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: executableDeliveryInclude,
    });
  }

  findDueRetries() {
    return this.db.messageDelivery.findMany({
      where: {
        status: DeliveryStatus.retrying,
        nextRetryAt: { lte: new Date() },
      },
      select: {
        id: true,
      },
      orderBy: {
        nextRetryAt: "asc",
      },
    });
  }

  resetStaleProcessing(thresholdMs: number) {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.db.messageDelivery.updateMany({
      where: {
        status: DeliveryStatus.processing,
        updatedAt: { lt: cutoff },
      },
      data: {
        status: DeliveryStatus.retrying,
        nextRetryAt: new Date(),
      },
    });
  }

  fetchDeliveryForRetry(deliveryId: string) {
    return this.db.messageDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: executableDeliveryInclude,
    });
  }
}

async function calculateMessageStatus(transaction: Prisma.TransactionClient, messageId: string): Promise<MessageStatus> {
  const deliveries = await transaction.messageDelivery.findMany({
    where: {
      messageId,
    },
    select: {
      status: true,
    },
  });

  if (deliveries.length === 0 || deliveries.some((delivery) => !isTerminalStatus(delivery.status))) {
    return MessageStatus.pending;
  }

  if (deliveries.every((delivery) => delivery.status === DeliveryStatus.success)) {
    return MessageStatus.success;
  }

  if (deliveries.every((delivery) => delivery.status === DeliveryStatus.failed)) {
    return MessageStatus.failed;
  }

  return MessageStatus.partial;
}

function isTerminalStatus(status: DeliveryStatus): boolean {
  return status === DeliveryStatus.success || status === DeliveryStatus.failed || status === DeliveryStatus.cancelled;
}

export const verifiedDeliveryExecutionPrismaFields = {
  deliveryAttempt: [
    "deliveryId",
    "attemptNumber",
    "status",
    "httpStatusCode",
    "providerMessageId",
    "providerResponse",
    "errorCode",
    "errorMessage",
    "attemptedAt",
  ],
  messageDelivery: ["messageId", "providerId", "targetId", "status", "attemptCount", "nextRetryAt", "sentAt"],
  providerConnection: ["id", "providerId", "authType", "secretRef", "config", "isActive"],
  notificationTarget: ["id", "providerConnectionId", "externalTargetId", "targetType", "metadata", "isActive"],
} satisfies Record<string, string[]>;

export type DeliveryExecutionProviderCode = ProviderCode;
