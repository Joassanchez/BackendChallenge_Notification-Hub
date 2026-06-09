import { describe, expect, it, vi } from "vitest";
import { DeliveryStatus, MessageStatus, ProviderCode, type Prisma } from "../../src/generated/prisma/client.js";
import type {
  AdminMetricsDailyUsage,
  AdminMetricsRepository,
  AdminMetricsUser,
} from "../../src/modules/administration/metrics/admin-metrics.repository.js";
import { AdminMetricsService } from "../../src/modules/administration/metrics/admin-metrics.service.js";
import type {
  AdminReportingMessage,
  AdminReportingRepository,
} from "../../src/modules/administration/reporting/admin-reporting.repository.js";
import { AdminReportingService } from "../../src/modules/administration/reporting/admin-reporting.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const deliveryId = "44444444-4444-4444-8444-444444444444";
const providerId = "55555555-5555-4555-8555-555555555555";
const targetId = "66666666-6666-4666-8666-666666666666";
const connectionId = "77777777-7777-4777-8777-777777777777";

type AdminReportingStore = Pick<AdminReportingRepository, "listMessages">;
type AdminMetricsStore = Pick<AdminMetricsRepository, "listUsers" | "countMessagesByUser" | "listDailyUsageForDate">;

function createService(input: {
  messages?: AdminReportingMessage[];
  users?: AdminMetricsUser[];
  messageCounts?: Array<{ userId: string; count: number }>;
  dailyUsage?: AdminMetricsDailyUsage[];
  defaultDailyLimit?: number;
} = {}) {
  const reports = {
    listMessages: vi.fn(async () => input.messages ?? []),
  } satisfies AdminReportingStore;
  const metrics = {
    listUsers: vi.fn(async () => input.users ?? []),
    countMessagesByUser: vi.fn(async () => input.messageCounts ?? []),
    listDailyUsageForDate: vi.fn(async () => input.dailyUsage ?? []),
  } satisfies AdminMetricsStore;

  return {
    service: new AdminReportingService(reports),
    metricsService: new AdminMetricsService(metrics, input.defaultDailyLimit ?? 100),
    reports,
    metrics,
  };
}

function buildAdminMessage(input: {
  status?: MessageStatus;
  providerCode?: ProviderCode;
  deliveryStatus?: DeliveryStatus;
  attemptCount?: number;
} = {}): AdminReportingMessage {
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const updatedAt = new Date("2026-01-02T04:05:06.000Z");
  const providerCode = input.providerCode ?? ProviderCode.telegram;

  return {
    id: messageId,
    userId,
    content: "Admin reporting payload",
    status: input.status ?? MessageStatus.success,
    idempotencyKey: null,
    createdAt,
    updatedAt,
    deliveries: [
      {
        id: deliveryId,
        messageId,
        providerId,
        targetId,
        status: input.deliveryStatus ?? DeliveryStatus.success,
        attemptCount: input.attemptCount ?? 2,
        nextRetryAt: null,
        sentAt: new Date("2026-01-02T03:05:00.000Z"),
        createdAt,
        updatedAt,
        provider: {
          id: providerId,
          code: providerCode,
          name: providerCode,
          isActive: true,
          createdAt,
          updatedAt,
        },
        target: {
          id: targetId,
          userId,
          providerId,
          providerConnectionId: connectionId,
          externalTargetId: "chat-123",
          targetType: "chat",
          displayName: "Primary chat",
          metadata: null as Prisma.JsonValue | null,
          isActive: true,
          createdAt,
          updatedAt,
        },
      },
    ],
  };
}

function buildUser(input: { id: string; username: string; email?: string | null }): AdminMetricsUser {
  return {
    id: input.id,
    username: input.username,
    email: "email" in input ? input.email ?? null : `${input.username}@example.com`,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function buildDailyUsage(input: { userId: string; sentCount: number; dailyLimit: number }): AdminMetricsDailyUsage {
  return {
    userId: input.userId,
    usageDate: new Date("2026-01-02T00:00:00.000Z"),
    sentCount: input.sentCount,
    dailyLimit: input.dailyLimit,
  };
}

describe("AdminReportingService", () => {
  it("passes typed message filters directly to the repository", async () => {
    const { service, reports } = createService();
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-02T23:59:59.000Z");

    await expect(
      service.listMessages({
        userId,
        status: MessageStatus.success,
        provider: ProviderCode.telegram,
        from,
        to,
      }),
    ).resolves.toEqual([]);

    expect(reports.listMessages).toHaveBeenCalledWith({
      userId,
      status: MessageStatus.success,
      provider: ProviderCode.telegram,
      from,
      to,
    });
  });

  it("maps admin message rows to stable DTO shape with provider delivery aggregation", async () => {
    const { service } = createService({
      messages: [buildAdminMessage({ providerCode: ProviderCode.discord, deliveryStatus: DeliveryStatus.failed, attemptCount: 3 })],
    });

    await expect(service.listMessages({ provider: ProviderCode.discord })).resolves.toEqual([
      {
        id: messageId,
        userId,
        content: "Admin reporting payload",
        status: MessageStatus.success,
        createdAt: "2026-01-02T03:04:05.000Z",
        updatedAt: "2026-01-02T04:05:06.000Z",
        deliveries: [
          {
            id: deliveryId,
            provider: ProviderCode.discord,
            targetType: "chat",
            externalTargetId: "chat-123",
            status: DeliveryStatus.failed,
            attemptsCount: 3,
          },
        ],
      },
    ]);
  });

  it("returns metrics for every user with default quotas and non-negative remaining values", async () => {
    const { metricsService, metrics } = createService({
      defaultDailyLimit: 7,
      users: [
        buildUser({ id: userId, username: "vitest_sender" }),
        buildUser({ id: otherUserId, username: "vitest_quota", email: null }),
      ],
      messageCounts: [{ userId, count: 4 }],
      dailyUsage: [buildDailyUsage({ userId, sentCount: 2, dailyLimit: 5 }), buildDailyUsage({ userId: otherUserId, sentCount: 11, dailyLimit: 10 })],
    });
    const now = new Date("2026-01-02T18:30:00.000Z");

    await expect(metricsService.getMetrics(now)).resolves.toEqual([
      {
        userId,
        email: "vitest_sender@example.com",
        username: "vitest_sender",
        totalMessagesSent: 4,
        sentToday: 2,
        dailyLimit: 5,
        remainingToday: 3,
      },
      {
        userId: otherUserId,
        email: null,
        username: "vitest_quota",
        totalMessagesSent: 0,
        sentToday: 11,
        dailyLimit: 10,
        remainingToday: 0,
      },
    ]);
    expect(metrics.listDailyUsageForDate).toHaveBeenCalledWith(new Date("2026-01-02T00:00:00.000Z"));
  });

  it("uses metric defaults when a user has no message count or usage row", async () => {
    const { metricsService } = createService({
      defaultDailyLimit: 25,
      users: [buildUser({ id: userId, username: "vitest_zero" })],
    });

    await expect(metricsService.getMetrics(new Date("2026-01-02T00:00:00.000Z"))).resolves.toEqual([
      {
        userId,
        email: "vitest_zero@example.com",
        username: "vitest_zero",
        totalMessagesSent: 0,
        sentToday: 0,
        dailyLimit: 25,
        remainingToday: 25,
      },
    ]);
  });

});
