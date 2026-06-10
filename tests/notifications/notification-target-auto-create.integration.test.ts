import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../../src/generated/prisma/client.js";
import { NotificationTargetService } from "../../src/modules/notifications/notification-targets/notification-target.service.js";
import { NotificationTargetRepository } from "../../src/modules/notifications/notification-targets/notification-target.repository.js";
import { cleanTransactionalData } from "../helpers/db-cleanup.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const repository = new NotificationTargetRepository(prisma);
const service = new NotificationTargetService(repository);

async function ensureSeedData() {
  const userRole = await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: { code: RoleCode.USER, name: "Default user" },
  });

  for (const provider of [
    { code: ProviderCode.telegram, name: "Telegram", isActive: true },
    { code: ProviderCode.discord, name: "Discord", isActive: true },
    { code: ProviderCode.slack, name: "Slack", isActive: false },
  ]) {
    await prisma.provider.upsert({
      where: { code: provider.code },
      update: { name: provider.name, isActive: provider.isActive },
      create: provider,
    });
  }

  return userRole;
}

async function createUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.user.create({
    data: {
      username: `auto_vitest_${suffix}`,
      email: `auto_vitest_${suffix}@example.com`,
      passwordHash: "hashed",
    },
  });
}

async function createConnection(providerCode: ProviderCode, authType: string) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: providerCode } });

  return prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `auto_vitest_${providerCode}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      authType,
      secretRef: null,
      config: {},
      isActive: true,
    },
  });
}

describe("NotificationTargetService.autoCreate", () => {
  beforeAll(async () => {
    await cleanTransactionalData(prisma);
    await ensureSeedData();
  });

  beforeEach(async () => {
    await cleanTransactionalData(prisma);
    await ensureSeedData();
  });

  afterAll(async () => {
    await cleanTransactionalData(prisma);
    await prisma.$disconnect();
  });

  it("auto-creates a Telegram chat target with correct fields", async () => {
    const user = await createUser();
    await createConnection(ProviderCode.telegram, "bot-token");

    const result = await service.autoCreate({
      userId: user.id,
      providerCode: "telegram",
      externalTargetId: "telegram-chat-123",
      targetType: "chat",
    });

    expect(result).toMatchObject({
      provider: "telegram",
      externalTargetId: "telegram-chat-123",
      targetType: "chat",
      isActive: true,
    });
    expect(result.id).toBeTruthy();
  });

  it("auto-creates a Discord channel target with correct fields", async () => {
    const user = await createUser();
    await createConnection(ProviderCode.discord, "bot-token");

    const result = await service.autoCreate({
      userId: user.id,
      providerCode: "discord",
      externalTargetId: "discord-channel-456",
      targetType: "channel",
    });

    expect(result).toMatchObject({
      provider: "discord",
      externalTargetId: "discord-channel-456",
      targetType: "channel",
      isActive: true,
    });
    expect(result.id).toBeTruthy();
  });

  it("returns existing target when duplicate is auto-created (idempotent)", async () => {
    const user = await createUser();
    await createConnection(ProviderCode.telegram, "bot-token");

    const first = await service.autoCreate({
      userId: user.id,
      providerCode: "telegram",
      externalTargetId: "same-chat-id",
      targetType: "chat",
    });

    const second = await service.autoCreate({
      userId: user.id,
      providerCode: "telegram",
      externalTargetId: "same-chat-id",
      targetType: "chat",
    });

    expect(second.id).toBe(first.id);
    expect(second.externalTargetId).toBe(first.externalTargetId);

    // Verify only one row exists in DB
    const count = await prisma.notificationTarget.count({
      where: {
        userId: user.id,
        providerId: (await prisma.provider.findUniqueOrThrow({ where: { code: ProviderCode.telegram } })).id,
        externalTargetId: "same-chat-id",
      },
    });
    expect(count).toBe(1);
  });

  it("throws error when no matching connection exists for target type", async () => {
    const user = await createUser();
    // Only webhook connection, no bot-token for channel
    await createConnection(ProviderCode.discord, "webhook");

    await expect(
      service.autoCreate({
        userId: user.id,
        providerCode: "discord",
        externalTargetId: "no-bot-token-target",
        targetType: "channel",
      }),
    ).rejects.toThrow("No matching connection for target type");
  });

  it("throws error when provider is inactive", async () => {
    const user = await createUser();

    await expect(
      service.autoCreate({
        userId: user.id,
        providerCode: "slack",
        externalTargetId: "slack-target",
        targetType: "chat",
      }),
    ).rejects.toThrow("Provider is not available");
  });
});
