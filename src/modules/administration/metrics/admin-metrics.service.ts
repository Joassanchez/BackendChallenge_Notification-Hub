import { badRequest } from "../../../shared/http/errors.js";
import type { AdminMetricsDailyUsage, AdminMetricsRepository, AdminMetricsUser } from "./admin-metrics.repository.js";

export type AdminMetricsDto = {
  userId: string;
  email: string | null;
  username: string;
  totalMessagesSent: number;
  sentToday: number;
  dailyLimit: number;
  remainingToday: number;
};

type AdminMetricsStore = Pick<AdminMetricsRepository, "listUsers" | "countMessagesByUser" | "listDailyUsageForDate">;

export class AdminMetricsService {
  constructor(
    private readonly metrics: AdminMetricsStore,
    private readonly defaultDailyLimit: number,
  ) {}

  async getMetrics(query: Record<string, unknown>, now = new Date()): Promise<AdminMetricsDto[]> {
    assertSupportedKeys(query, []);

    const usageDate = toUtcUsageDate(now);
    const [users, messageCounts, dailyUsage] = await Promise.all([
      this.metrics.listUsers(),
      this.metrics.countMessagesByUser(),
      this.metrics.listDailyUsageForDate(usageDate),
    ]);

    const countsByUser = new Map(messageCounts.map((count) => [count.userId, count.count]));
    const usageByUser = new Map(dailyUsage.map((usage) => [usage.userId, usage]));

    return users.map((user) => toAdminMetricsDto(user, countsByUser.get(user.id) ?? 0, usageByUser.get(user.id), this.defaultDailyLimit));
  }
}

function assertSupportedKeys(query: Record<string, unknown>, supportedKeys: readonly string[]): void {
  for (const key of Object.keys(query)) {
    if (!supportedKeys.includes(key)) {
      throw badRequest(`Unsupported query parameter: ${key}`);
    }
  }
}

function toUtcUsageDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toAdminMetricsDto(
  user: AdminMetricsUser,
  totalMessagesSent: number,
  usage: AdminMetricsDailyUsage | undefined,
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
