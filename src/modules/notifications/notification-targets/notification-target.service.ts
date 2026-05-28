import { Prisma, ProviderCode, type ProviderCode as ProviderCodeType } from "../../../generated/prisma/client.js";
import { badRequest, conflict, notFound } from "../../../shared/http/errors.js";
import type {
  NotificationTargetRepository,
  NotificationTargetWithProvider,
  UpdateNotificationTargetData,
} from "./notification-target.repository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedTargetTypes: Readonly<Record<"telegram" | "discord", string>> = {
  [ProviderCode.telegram]: "chat",
  [ProviderCode.discord]: "webhook",
} as const;

export type NotificationTargetDto = {
  id: string;
  provider: ProviderCodeType;
  externalTargetId: string;
  targetType: string;
  displayName: string | null;
  metadata: Prisma.JsonValue | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateNotificationTargetInput = {
  userId: string;
  body: unknown;
};

export type UpdateNotificationTargetInput = {
  userId: string;
  targetId: string;
  body: unknown;
};

export class NotificationTargetService {
  constructor(private readonly targets: NotificationTargetRepository) {}

  async list(userId: string): Promise<{ targets: NotificationTargetDto[] }> {
    const targets = await this.targets.listForUser(userId);

    return {
      targets: targets.map(toNotificationTargetDto),
    };
  }

  async create(input: CreateNotificationTargetInput): Promise<NotificationTargetDto> {
    const body = readBodyRecord(input.body);

    if ("providerConnectionId" in body) {
      throw badRequest("providerConnectionId is not accepted");
    }

    const providerCode = readProviderCode(body.provider);
    const targetType = readTargetType(body.targetType);
    validateProviderTargetType(providerCode, targetType);

    const provider = await this.targets.findProviderByCode(providerCode);

    if (provider === null || !provider.isActive) {
      throw badRequest("Provider is not available");
    }

    const connections = await this.targets.findActiveConnectionsForProvider(provider.id);

    if (connections.length === 0) {
      throw badRequest("Provider has no active connection");
    }

    if (connections.length > 1) {
      throw badRequest("Provider has multiple active connections");
    }

    const externalTargetId = readRequiredString(body.externalTargetId, "externalTargetId");
    const duplicate = await this.targets.findActiveDuplicate({
      userId: input.userId,
      providerId: provider.id,
      externalTargetId,
      targetType,
    });

    if (duplicate !== null) {
      throw conflict("Notification target already exists");
    }

    const activeConnection = connections[0];

    if (activeConnection === undefined) {
      throw badRequest("Provider has no active connection");
    }

    const displayName = readOptionalString(body.displayName, "displayName");
    const metadata = readOptionalJsonObject(body.metadata, "metadata");
    const target = await this.targets.create({
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: activeConnection.id,
      externalTargetId,
      targetType,
      ...(displayName === undefined ? {} : { displayName }),
      ...(metadata === undefined ? {} : { metadata }),
    });

    return toNotificationTargetDto(target);
  }

  async update(input: UpdateNotificationTargetInput): Promise<NotificationTargetDto> {
    const targetId = readTargetId(input.targetId);
    const body = readBodyRecord(input.body);
    const allowedKeys = ["displayName", "metadata"];
    const forbiddenKeys = ["provider", "providerConnectionId", "externalTargetId", "targetType"];

    if (forbiddenKeys.some((key) => key in body)) {
      throw badRequest("Destination fields cannot be updated");
    }

    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      throw badRequest("Only displayName and metadata can be updated");
    }

    const existing = await this.targets.findForUser(input.userId, targetId);

    if (existing === null) {
      throw notFound("Notification target not found");
    }

    const data: UpdateNotificationTargetData = {};

    if ("displayName" in body) {
      const displayName = readOptionalString(body.displayName, "displayName");
      if (displayName !== undefined) {
        data.displayName = displayName;
      }
    }

    if ("metadata" in body) {
      const metadata = readOptionalJsonObject(body.metadata, "metadata");
      if (metadata !== undefined) {
        data.metadata = metadata;
      }
    }

    const target = await this.targets.updateForUser(input.userId, targetId, data);

    return toNotificationTargetDto(target);
  }

  async activate(userId: string, targetIdInput: string): Promise<NotificationTargetDto> {
    const targetId = readTargetId(targetIdInput);
    const existing = await this.targets.findForUser(userId, targetId);

    if (existing === null) {
      throw notFound("Notification target not found");
    }

    const duplicate = await this.targets.findActiveDuplicate({
      userId,
      providerId: existing.providerId,
      externalTargetId: existing.externalTargetId,
      targetType: existing.targetType,
      excludeId: existing.id,
    });

    if (duplicate !== null) {
      throw conflict("Notification target already exists");
    }

    const target = await this.targets.setActiveForUser(userId, targetId, true);

    return toNotificationTargetDto(target);
  }

  async deactivate(userId: string, targetIdInput: string): Promise<NotificationTargetDto> {
    const targetId = readTargetId(targetIdInput);
    const existing = await this.targets.findForUser(userId, targetId);

    if (existing === null) {
      throw notFound("Notification target not found");
    }

    const target = await this.targets.setActiveForUser(userId, targetId, false);

    return toNotificationTargetDto(target);
  }
}

function toNotificationTargetDto(target: NotificationTargetWithProvider): NotificationTargetDto {
  return {
    id: target.id,
    provider: target.provider.code,
    externalTargetId: target.externalTargetId,
    targetType: target.targetType,
    displayName: target.displayName,
    metadata: target.metadata,
    isActive: target.isActive,
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
  };
}

function readBodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

function readProviderCode(value: unknown): ProviderCodeType {
  if (typeof value !== "string" || !Object.values(ProviderCode).includes(value as ProviderCode)) {
    throw badRequest("provider must be a valid provider code");
  }

  return value as ProviderCodeType;
}

function readTargetType(value: unknown): string {
  return readRequiredString(value, "targetType");
}

function validateProviderTargetType(provider: ProviderCodeType, targetType: string): void {
  if (provider !== ProviderCode.telegram && provider !== ProviderCode.discord) {
    throw badRequest("provider target type is not supported");
  }

  if (allowedTargetTypes[provider] !== targetType) {
    throw badRequest("provider target type is not supported");
  }
}

function readRequiredString(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw badRequest(`${key} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    throw badRequest(`${key} must not be empty`);
  }

  return trimmed;
}

function readOptionalString(value: unknown, key: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return readRequiredString(value, key);
}

function readOptionalJsonObject(value: unknown, key: string): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${key} must be an object`);
  }

  return value as Prisma.InputJsonObject;
}

function readTargetId(value: string): string {
  if (!uuidPattern.test(value)) {
    throw badRequest("target id must be a valid UUID");
  }

  return value;
}
