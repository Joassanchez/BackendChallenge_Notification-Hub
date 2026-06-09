import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import type { DeliveryProviderRegistry } from "../src/modules/delivery/adapters/delivery-provider-adapter.js";
import { cleanTransactionalData } from "./helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";
process.env.DAILY_MESSAGE_LIMIT = "2";

const { createApp } = await import("../src/app.js");
const { prisma: appPrisma } = await import("../src/shared/database/prisma.js");
const { MessageRepository } = await import("../src/modules/notifications/messages/message-repository.js");
const { RateLimitRepository } = await import("../src/modules/quota/rate-limiting/rate-limit.repository.js");
const { RateLimitService } = await import("../src/modules/quota/rate-limiting/rate-limit.service.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const successfulDeliveryAdapters = {
  [ProviderCode.telegram]: {
    send: async () => ({ kind: "success", httpStatusCode: 200, providerMessageId: "telegram_rate_limit_test" }),
  },
  [ProviderCode.discord]: {
    send: async () => ({ kind: "success", httpStatusCode: 204, providerMessageId: "discord_rate_limit_test" }),
  },
} satisfies DeliveryProviderRegistry;

const failedDeliveryAdapters = {
  [ProviderCode.telegram]: {
    send: async () => ({ kind: "provider_error", httpStatusCode: 503, errorCode: "TEST_PROVIDER_DOWN", errorMessage: "Provider down" }),
  },
} satisfies DeliveryProviderRegistry;

const app = createApp({ deliveryAdapters: successfulDeliveryAdapters });
const failingProviderApp = createApp({ deliveryAdapters: failedDeliveryAdapters });

async function ensureSeedData() {
  await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: { code: RoleCode.USER, name: "Default user" },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.telegram },
    update: { isActive: true },
    create: { code: ProviderCode.telegram, name: "Telegram" },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.discord },
    update: { isActive: true },
    create: { code: ProviderCode.discord, name: "Discord" },
  });
}

function uniqueUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    username: `rl_msg_vitest_${suffix}`,
    email: `rl_msg_vitest_${suffix}@example.com`,
    password: "Password123!",
  };
}

async function createUserAndLogin() {
  const input = uniqueUser();
  await request(app).post("/auth/register").send(input).expect(201);

  const login = await request(app).post("/auth/login").send({ username: input.username, password: input.password }).expect(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });

  return { user, token: login.body.accessToken as string };
}

async function createTarget(input: { userId: string; providerCode: ProviderCode }) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: input.providerCode } });
  const connection = await prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `rl_msg_vitest_${input.providerCode}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      authType: "test",
      isActive: true,
    },
  });

  return prisma.notificationTarget.create({
    data: {
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: connection.id,
      externalTargetId: `external_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      targetType: "channel",
      displayName: "Test target",
      isActive: true,
    },
  });
}

function currentUtcUsageDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatUsageDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function postMessage(token: string, body: object, idempotencyKey?: string, targetApp = app) {
  const builder = request(targetApp).post("/messages").set("Authorization", `Bearer ${token}`).send(body);

  return idempotencyKey === undefined ? builder : builder.set("Idempotency-Key", idempotencyKey);
}

async function findUsage(userId: string) {
  return prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate: currentUtcUsageDate(),
      },
    },
  });
}

describe("Rate limiting message quota integration", () => {
  beforeAll(async () => {
    await ensureSeedData();
    await cleanTransactionalData(prisma);
  });

  afterAll(async () => {
    await cleanTransactionalData(prisma);
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("consumes one UTC-day quota unit per newly accepted logical message, not per destination", async () => {
    const { user, token } = await createUserAndLogin();
    const telegramTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const discordTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord });

    const response = await postMessage(token, {
      content: "One logical message",
      destinations: [
        { provider: "telegram", targetId: telegramTarget.id },
        { provider: "discord", targetId: discordTarget.id },
      ],
    }).expect(201);

    expect(response.body).toMatchObject({ content: "One logical message", status: "success" });
    expect(response.body.deliveries).toHaveLength(2);

    const usage = await findUsage(user.id);
    expect(usage).toMatchObject({
      sentCount: 1,
      dailyLimit: 2,
      usageDate: currentUtcUsageDate(),
    });

    const report = await request(app).get("/rate-limit/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(report.body).toEqual({
      usageDate: formatUsageDate(currentUtcUsageDate()),
      dailyLimit: 2,
      usedToday: 1,
      remainingToday: 1,
    });
  });

  it("rejects exhausted quota with 429 RATE_LIMIT_EXCEEDED before creating a message", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });

    await prisma.dailyUsage.create({
      data: {
        userId: user.id,
        usageDate: currentUtcUsageDate(),
        sentCount: 2,
        dailyLimit: 2,
      },
    });

    const response = await postMessage(token, {
      content: "Over quota",
      destinations: [{ provider: "telegram", targetId: target.id }],
    }).expect(429);

    expect(response.body).toEqual({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Daily message limit exceeded",
    });
    expect(await prisma.message.count({ where: { userId: user.id } })).toBe(0);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 2, dailyLimit: 2 });
  });

  it("does not consume quota for idempotent replay or reused-key conflict", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const key = `quota_key_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const body = {
      content: "Idempotent quota",
      destinations: [{ provider: "telegram", targetId: target.id }],
    };

    const first = await postMessage(token, body, key).expect(201);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 1 });

    const replay = await postMessage(token, body, key).expect(200);
    expect(replay.body.messageId).toBe(first.body.messageId);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 1 });

    await postMessage(token, { content: "Changed payload", destinations: body.destinations }, key).expect(409);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 1 });
  });

  it("does not consume quota when request validation or destination validation rejects before acceptance", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });

    await postMessage(token, { content: " ", destinations: [{ provider: "telegram", targetId: target.id }] }).expect(400);
    expect(await findUsage(user.id)).toBeNull();

    await postMessage(token, {
      content: "Invalid destination",
      destinations: [{ provider: "telegram", targetId: "00000000-0000-4000-8000-000000000000" }],
    }).expect(400);
    expect(await findUsage(user.id)).toBeNull();
  });

  it("rolls back quota when message persistence fails inside the creation transaction", async () => {
    const { user } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const idempotencyKey = `rollback_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const messages = new MessageRepository(prisma);
    const rateLimits = new RateLimitService(new RateLimitRepository(prisma), 2);

    await prisma.message.create({
      data: {
        userId: user.id,
        content: "Existing message",
        idempotencyKey,
      },
    });

    await expect(
      messages.createPendingMessage({
        userId: user.id,
        content: "Duplicate message",
        destinations: [{ provider: ProviderCode.telegram, targetId: target.id }],
        idempotencyKey,
        beforeCreate: (transaction) => rateLimits.reserveMessage(transaction, user.id),
      }),
    ).rejects.toThrow();

    expect(await findUsage(user.id)).toBeNull();
    expect(await prisma.message.count({ where: { userId: user.id, idempotencyKey } })).toBe(1);
  });

  it("keeps consumed quota when provider execution fails after message acceptance", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });

    const response = await postMessage(
      token,
      {
        content: "Provider will fail",
        destinations: [{ provider: "telegram", targetId: target.id }],
      },
      undefined,
      failingProviderApp,
    ).expect(201);

    expect(response.body).toMatchObject({ content: "Provider will fail", status: "pending" });
    expect(response.body.deliveries).toEqual([
      expect.objectContaining({ provider: "telegram", targetId: target.id, status: "retrying" }),
    ]);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 1, dailyLimit: 2 });
  });

  it("does not overshoot quota when two concurrent creates race for one remaining unit", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });

    await prisma.dailyUsage.create({
      data: {
        userId: user.id,
        usageDate: currentUtcUsageDate(),
        sentCount: 1,
        dailyLimit: 2,
      },
    });

    const firstBody = { content: "Race A", destinations: [{ provider: "telegram", targetId: target.id }] };
    const secondBody = { content: "Race B", destinations: [{ provider: "telegram", targetId: target.id }] };
    const responses = await Promise.all([postMessage(token, firstBody), postMessage(token, secondBody)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
    expect(await prisma.message.count({ where: { userId: user.id } })).toBe(1);
    await expect(findUsage(user.id)).resolves.toMatchObject({ sentCount: 2, dailyLimit: 2 });
  });
});
