import { describe, expect, it, vi } from "vitest";
import { cleanTransactionalData } from "./db-cleanup.js";

function mockPrisma() {
  const calls: string[] = [];
  const makeTable = (name: string) => ({
    deleteMany: vi.fn().mockImplementation(() => {
      calls.push(name);
      return Promise.resolve({ count: 0 });
    }),
  });

  return {
    prisma: {
      deliveryAttempt: makeTable("delivery_attempts"),
      messageDelivery: makeTable("message_deliveries"),
      message: makeTable("messages"),
      notificationTarget: makeTable("notification_targets"),
      providerConnection: makeTable("provider_connections"),
      dailyUsage: makeTable("daily_usage"),
      auditLog: makeTable("audit_logs"),
      userRole: makeTable("user_roles"),
      user: makeTable("users"),
      provider: makeTable("providers"),
      role: makeTable("roles"),
    },
    calls,
  };
}

describe("cleanTransactionalData", () => {
  it("deletes transactional tables in FK-safe order and preserves seed data", async () => {
    const { prisma, calls } = mockPrisma();

    await cleanTransactionalData(prisma as any);

    // Must delete these 9 tables
    expect(calls).toHaveLength(9);
    expect(calls).toEqual([
      "delivery_attempts",
      "message_deliveries",
      "messages",
      "notification_targets",
      "provider_connections",
      "daily_usage",
      "audit_logs",
      "user_roles",
      "users",
    ]);
  });

  it("never touches providers or roles (seed data)", async () => {
    const { prisma } = mockPrisma();

    await cleanTransactionalData(prisma as any);

    expect(prisma.provider.deleteMany).not.toHaveBeenCalled();
    expect(prisma.role.deleteMany).not.toHaveBeenCalled();
  });

  it("returns void Promise", async () => {
    const { prisma } = mockPrisma();
    const result = await cleanTransactionalData(prisma as any);
    expect(result).toBeUndefined();
  });
});
