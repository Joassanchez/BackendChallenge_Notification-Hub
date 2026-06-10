import { Prisma, type ProviderCode as ProviderCodeType } from "../../../generated/prisma/client.js";
import { badRequest, conflict, notFound } from "../../../shared/http/errors.js";
import type {
  NotificationTargetRepository,
  NotificationTargetWithProvider,
  UpdateNotificationTargetData,
} from "./notification-target.repository.js";

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
  provider: ProviderCodeType;
  targetType: string;
  externalTargetId: string;
  displayName?: string | null;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
};

export type UpdateNotificationTargetInput = {
  userId: string;
  targetId: string;
  displayName?: string | null;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
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
    const provider = await this.targets.findProviderByCode(input.provider);

    if (provider === null || !provider.isActive) {
      throw badRequest("Provider is not available");
    }

    const connections = await this.targets.findActiveConnectionsForProvider(provider.id);

    if (connections.length === 0) {
      throw badRequest("Provider has no active connection");
    }

    const duplicate = await this.targets.findActiveDuplicate({
      userId: input.userId,
      providerId: provider.id,
      externalTargetId: input.externalTargetId,
      targetType: input.targetType,
    });

    if (duplicate !== null) {
      throw conflict("Notification target already exists");
    }

    const activeConnection = await this.resolveConnection(provider.id, input.targetType);

    const target = await this.targets.create({
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: activeConnection.id,
      externalTargetId: input.externalTargetId,
      targetType: input.targetType,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });

    return toNotificationTargetDto(target);
  }

  private async resolveConnection(providerId: string, targetType: string) {
    const mapping: Record<string, string> = {
      chat: "bot-token",
      webhook: "webhook",
      channel: "bot-token",
    };

    const expectedAuthType = mapping[targetType];
    if (expectedAuthType === undefined) {
      throw badRequest(`Unsupported target type: ${targetType}`);
    }

    const connections = await this.targets.findActiveConnectionsForProvider(providerId);

    const matching = connections.find((c) => c.authType === expectedAuthType);
    if (matching === undefined) {
      throw badRequest("No matching connection for target type");
    }

    return matching;
  }

  async autoCreate(input: {
    userId: string;
    providerCode: string;
    externalTargetId: string;
    targetType: string;
  }): Promise<NotificationTargetDto> {
    const provider = await this.targets.findProviderByCode(input.providerCode as ProviderCodeType);

    if (provider === null || !provider.isActive) {
      throw badRequest("Provider is not available");
    }

    const duplicate = await this.targets.findActiveDuplicate({
      userId: input.userId,
      providerId: provider.id,
      externalTargetId: input.externalTargetId,
      targetType: input.targetType,
    });

    if (duplicate !== null) {
      const fullDuplicate = await this.targets.findForUser(input.userId, duplicate.id);
      if (fullDuplicate !== null) return toNotificationTargetDto(fullDuplicate);
    }

    const connection = await this.resolveConnection(provider.id, input.targetType);

    const target = await this.targets.create({
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: connection.id,
      externalTargetId: input.externalTargetId,
      targetType: input.targetType,
    });

    return toNotificationTargetDto(target);
  }

  async update(input: UpdateNotificationTargetInput): Promise<NotificationTargetDto> {
    const existing = await this.targets.findForUser(input.userId, input.targetId);

    if (existing === null) {
      throw notFound("Notification target not found");
    }

    const data: UpdateNotificationTargetData = {};

    if (input.displayName !== undefined) {
      data.displayName = input.displayName;
    }

    if (input.metadata !== undefined) {
      data.metadata = input.metadata;
    }

    const target = await this.targets.updateForUser(input.userId, input.targetId, data);

    return toNotificationTargetDto(target);
  }

  async activate(userId: string, targetId: string): Promise<NotificationTargetDto> {
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

  async deactivate(userId: string, targetId: string): Promise<NotificationTargetDto> {
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
