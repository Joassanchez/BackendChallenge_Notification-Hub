import { MessageStatus, Prisma, ProviderCode } from "../../../generated/prisma/client.js";
import { conflict, notFound } from "../../../shared/http/errors.js";
import type { DeliveryExecutionService } from "../../delivery/execution/delivery-execution.service.js";
import type { RateLimitService } from "../../quota/rate-limiting/rate-limit.service.js";
import type { MessageRepository, MessageWithDeliveries, NormalizedDestination } from "./message-repository.js";

export type CreateMessageInput = {
  userId: string;
  content: string;
  destinations: NormalizedDestination[];
  idempotencyKey?: string;
};

export type ListMessagesInput = {
  userId: string;
  status?: MessageStatus;
  provider?: ProviderCode;
  from?: string;
  to?: string;
};

export type MessageDto = {
  id: string;
  messageId: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deliveries: Array<{
    id: string;
    provider: ProviderCode;
    targetId: string;
    status: string;
  }>;
};

export class MessageService {
  constructor(
    private readonly messages: MessageRepository,
    private readonly deliveryExecution?: DeliveryExecutionService,
    private readonly rateLimits?: RateLimitService,
  ) {}

  async create(input: CreateMessageInput): Promise<{ message: MessageDto; created: boolean }> {
    const { content, destinations, idempotencyKey } = input;

    if (idempotencyKey !== undefined) {
      const existing = await this.messages.findByIdempotencyKey(input.userId, idempotencyKey);

      if (existing !== null) {
        return { message: replayOrConflict(existing, content, destinations), created: false };
      }
    }

    try {
      const rateLimits = this.rateLimits;
      const message = await this.messages.createPendingMessage({
        userId: input.userId,
        content,
        destinations,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        ...(rateLimits === undefined
          ? {}
          : {
              beforeCreate: (transaction) => rateLimits.reserveMessage(transaction, input.userId),
            }),
      });

      if (this.deliveryExecution === undefined) {
        return { message: toMessageDto(message), created: true };
      }

      await this.deliveryExecution.executeMessage(message.id);

      const executedMessage = await this.messages.findById(message.id);

      return { message: toMessageDto(executedMessage ?? message), created: true };
    } catch (error) {
      if (idempotencyKey !== undefined && isUniqueConstraintError(error)) {
        const existing = await this.messages.findByIdempotencyKey(input.userId, idempotencyKey);

        if (existing !== null) {
          return { message: replayOrConflict(existing, content, destinations), created: false };
        }
      }

      throw error;
    }
  }

  async list(input: ListMessagesInput): Promise<MessageDto[]> {
    const filters = {
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.from === undefined ? {} : { from: new Date(input.from) }),
      ...(input.to === undefined ? {} : { to: new Date(input.to) }),
    };
    const messages = await this.messages.listForUser(input.userId, filters);

    return messages.map(toMessageDto);
  }

  async getById(userId: string, messageId: string): Promise<MessageDto> {
    const message = await this.messages.findByIdForUser(userId, messageId);

    if (message === null) {
      throw notFound("Message not found");
    }

    return toMessageDto(message);
  }
}

function replayOrConflict(message: MessageWithDeliveries, content: string, destinations: NormalizedDestination[]): MessageDto {
  if (message.content !== content || fingerprintFromMessage(message) !== fingerprintFromDestinations(destinations)) {
    throw conflict("Idempotency-Key was already used with a different payload");
  }

  return toMessageDto(message);
}

function fingerprintFromMessage(message: MessageWithDeliveries): string {
  return message.deliveries.map((delivery) => destinationKey({ provider: delivery.provider.code, targetId: delivery.targetId })).sort().join("|");
}

function fingerprintFromDestinations(destinations: NormalizedDestination[]): string {
  return destinations.map(destinationKey).sort().join("|");
}

function destinationKey(destination: NormalizedDestination): string {
  return `${destination.provider}:${destination.targetId}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function toMessageDto(message: MessageWithDeliveries): MessageDto {
  return {
    id: message.id,
    messageId: message.id,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    deliveries: message.deliveries.map((delivery) => ({
      id: delivery.id,
      provider: delivery.provider.code,
      targetId: delivery.targetId,
      status: delivery.status,
    })),
  };
}
