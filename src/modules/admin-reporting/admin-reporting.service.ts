import { MessageStatus, ProviderCode, type DeliveryStatus } from "../../generated/prisma/client.js";
import { badRequest } from "../../shared/http/errors.js";
import type {
  AdminReportingDailyUsage,
  AdminReportingMessage,
  AdminReportingMessageFilters,
  AdminReportingRepository,
  AdminReportingUser,
} from "./admin-reporting.repository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimeWithZonePattern = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;

const messageQueryKeys = ["userId", "status", "provider", "from", "to"] as const;

export type AdminMessageDeliveryDto = {
  id: string;
  provider: ProviderCode;
  targetType: string;
  externalTargetId: string;
  status: DeliveryStatus;
  attemptsCount: number;
};

export type AdminMessageDto = {
  id: string;
  userId: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  deliveries: AdminMessageDeliveryDto[];
};

export type AdminMetricsDto = {
  userId: string;
  email: string | null;
  username: string;
  totalMessagesSent: number;
  sentToday: number;
  dailyLimit: number;
  remainingToday: number;
};

type AdminReportingStore = Pick<AdminReportingRepository, "listMessages" | "listUsers" | "countMessagesByUser" | "listDailyUsageForDate">;

export class AdminReportingService {
  constructor(
    private readonly reports: AdminReportingStore,
    private readonly defaultDailyLimit: number,
  ) {}

  async listMessages(query: Record<string, unknown>): Promise<AdminMessageDto[]> {
    const filters = readMessageFilters(query);
    const messages = await this.reports.listMessages(filters);

    return messages.map(toAdminMessageDto);
  }

  async getMetrics(query: Record<string, unknown>, now = new Date()): Promise<AdminMetricsDto[]> {
    assertSupportedKeys(query, []);

    const usageDate = toUtcUsageDate(now);
    const [users, messageCounts, dailyUsage] = await Promise.all([
      this.reports.listUsers(),
      this.reports.countMessagesByUser(),
      this.reports.listDailyUsageForDate(usageDate),
    ]);

    const countsByUser = new Map(messageCounts.map((count) => [count.userId, count.count]));
    const usageByUser = new Map(dailyUsage.map((usage) => [usage.userId, usage]));

    return users.map((user) => toAdminMetricsDto(user, countsByUser.get(user.id) ?? 0, usageByUser.get(user.id), this.defaultDailyLimit));
  }
}

function readMessageFilters(query: Record<string, unknown>): AdminReportingMessageFilters {
  assertSupportedKeys(query, messageQueryKeys);

  const userId = readOptionalUuid(readSingletonQueryParam(query, "userId"), "userId");
  const status = readOptionalMessageStatus(readSingletonQueryParam(query, "status"));
  const provider = readOptionalProviderCode(readSingletonQueryParam(query, "provider"));
  const from = readOptionalUtcDate(readSingletonQueryParam(query, "from"), "from");
  const to = readOptionalUtcDate(readSingletonQueryParam(query, "to"), "to");

  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw badRequest("from must be before or equal to to");
  }

  const filters: AdminReportingMessageFilters = {};

  if (userId !== undefined) {
    filters.userId = userId;
  }

  if (status !== undefined) {
    filters.status = status;
  }

  if (provider !== undefined) {
    filters.provider = provider;
  }

  if (from !== undefined) {
    filters.from = from;
  }

  if (to !== undefined) {
    filters.to = to;
  }

  return filters;
}

function assertSupportedKeys(query: Record<string, unknown>, supportedKeys: readonly string[]): void {
  for (const key of Object.keys(query)) {
    if (!supportedKeys.includes(key)) {
      throw badRequest(`Unsupported query parameter: ${key}`);
    }
  }
}

function readSingletonQueryParam(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw badRequest(`${key} must be a single value`);
  }

  return value.trim();
}

function readOptionalUuid(value: string | undefined, key: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!uuidPattern.test(value)) {
    throw badRequest(`${key} must be a valid UUID`);
  }

  return value;
}

function readOptionalMessageStatus(value: string | undefined): MessageStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Object.values(MessageStatus).includes(value as MessageStatus)) {
    throw badRequest("status must be a valid message status");
  }

  return value as MessageStatus;
}

function readOptionalProviderCode(value: string | undefined): ProviderCode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Object.values(ProviderCode).includes(value as ProviderCode)) {
    throw badRequest("provider must be a valid provider code");
  }

  return value as ProviderCode;
}

function readOptionalUtcDate(value: string | undefined, key: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (dateOnlyPattern.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw badRequest(`${key} must be a valid date`);
    }

    return date;
  }

  if (!isoDateTimeWithZonePattern.test(value)) {
    throw badRequest(`${key} must include a UTC offset or Z timezone`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${key} must be a valid date`);
  }

  return date;
}

function toUtcUsageDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toAdminMessageDto(message: AdminReportingMessage): AdminMessageDto {
  return {
    id: message.id,
    userId: message.userId,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    deliveries: message.deliveries.map((delivery) => ({
      id: delivery.id,
      provider: delivery.provider.code,
      targetType: delivery.target.targetType,
      externalTargetId: delivery.target.externalTargetId,
      status: delivery.status,
      attemptsCount: delivery.attemptCount,
    })),
  };
}

function toAdminMetricsDto(
  user: AdminReportingUser,
  totalMessagesSent: number,
  usage: AdminReportingDailyUsage | undefined,
  defaultDailyLimit: number,
): AdminMetricsDto {
  const sentToday = usage?.sentCount ?? 0;
  const dailyLimit = usage?.dailyLimit ?? defaultDailyLimit;

  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    totalMessagesSent,
    sentToday,
    dailyLimit,
    remainingToday: Math.max(dailyLimit - sentToday, 0),
  };
}
