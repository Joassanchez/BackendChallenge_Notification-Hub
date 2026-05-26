import { MessageStatus, Prisma, ProviderCode } from "../../generated/prisma/client.js";
import { badRequest, conflict, notFound } from "../../shared/http/errors.js";
import type { DeliveryExecutionService } from "../delivery-execution/delivery-execution.service.js";
import type { RateLimitService } from "../rate-limiting/rate-limit.service.js";
import type { MessageRepository, MessageWithDeliveries, NormalizedDestination, MessageListFilters } from "./message-repository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateMessageInput = {
  userId: string;
  content: unknown;
  destinations: unknown;
  idempotencyKey?: string;
};

export type ListMessagesInput = {
  userId: string;
  status?: unknown;
  provider?: unknown;
  from?: unknown;
  to?: unknown;
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
    const content = readContent(input.content);
    const destinations = readDestinations(input.destinations);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

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
    const filters = readListFilters(input);
    const messages = await this.messages.listForUser(input.userId, filters);

    return messages.map(toMessageDto);
  }

  async getById(userId: string, messageId: string): Promise<MessageDto> {
    if (!uuidPattern.test(messageId)) {
      throw badRequest("message id must be a valid UUID");
    }

    const message = await this.messages.findByIdForUser(userId, messageId);

    if (message === null) {
      throw notFound("Message not found");
    }

    return toMessageDto(message);
  }
}

function readContent(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("content must be a string");
  }

  const content = value.trim();

  if (content === "") {
    throw badRequest("content must not be empty");
  }

  return content;
}

function readDestinations(value: unknown): NormalizedDestination[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest("destinations must be a non-empty array");
  }

  const destinations = value.map((destination, index) => readDestination(destination, index));
  const uniqueKeys = new Set(destinations.map(destinationKey));

  if (uniqueKeys.size !== destinations.length) {
    throw badRequest("destinations must not contain duplicates");
  }

  return destinations;
}

function readDestination(value: unknown, index: number): NormalizedDestination {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`destinations[${index}] must be an object`);
  }

  const record = value as Record<string, unknown>;
  const provider = readProviderCode(record.provider, `destinations[${index}].provider`);
  const targetId = readUuid(record.targetId, `destinations[${index}].targetId`);

  return { provider, targetId };
}

function readListFilters(input: ListMessagesInput): MessageListFilters {
  const status = input.status === undefined ? undefined : readMessageStatus(input.status);
  const provider = input.provider === undefined ? undefined : readProviderCode(input.provider, "provider");
  const from = input.from === undefined ? undefined : readDate(input.from, "from");
  const to = input.to === undefined ? undefined : readDate(input.to, "to");

  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw badRequest("from must be before or equal to to");
  }

  return {
    ...(status === undefined ? {} : { status }),
    ...(provider === undefined ? {} : { provider }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

function readProviderCode(value: unknown, key: string): ProviderCode {
  if (typeof value !== "string" || !isProviderCode(value)) {
    throw badRequest(`${key} must be a valid provider code`);
  }

  return value;
}

function readMessageStatus(value: unknown): MessageStatus {
  if (typeof value !== "string" || !isMessageStatus(value)) {
    throw badRequest("status must be a valid message status");
  }

  return value;
}

function readUuid(value: unknown, key: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw badRequest(`${key} must be a valid UUID`);
  }

  return value;
}

function readDate(value: unknown, key: string): Date {
  if (typeof value !== "string") {
    throw badRequest(`${key} must be a valid date`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${key} must be a valid date`);
  }

  return date;
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const key = value.trim();

  if (key === "") {
    throw badRequest("Idempotency-Key must not be empty");
  }

  return key;
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

function isProviderCode(value: string): value is ProviderCode {
  return Object.values(ProviderCode).includes(value as ProviderCode);
}

function isMessageStatus(value: string): value is MessageStatus {
  return Object.values(MessageStatus).includes(value as MessageStatus);
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
