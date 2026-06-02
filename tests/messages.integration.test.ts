import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import type { DeliveryProviderRegistry } from "../src/modules/delivery/adapters/delivery-provider-adapter.js";
import { cleanTransactionalData } from "./helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

const { createApp } = await import("../src/app.js");
const { prisma: appPrisma } = await import("../src/shared/database/prisma.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const successfulDeliveryAdapters = {
  [ProviderCode.telegram]: {
    send: async () => ({ kind: "success", httpStatusCode: 200, providerMessageId: "telegram_test_message" }),
  },
  [ProviderCode.discord]: {
    send: async () => ({ kind: "success", httpStatusCode: 204, providerMessageId: "discord_test_message" }),
  },
} satisfies DeliveryProviderRegistry;

const app = createApp({ deliveryAdapters: successfulDeliveryAdapters });

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

  await prisma.provider.upsert({
    where: { code: ProviderCode.slack },
    update: { isActive: false },
    create: { code: ProviderCode.slack, name: "Slack", isActive: false },
  });
}

function uniqueUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    username: `msg_vitest_${suffix}`,
    email: `msg_vitest_${suffix}@example.com`,
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

async function createTarget(input: { userId: string; providerCode: ProviderCode; active?: boolean }) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: input.providerCode } });
  const connection = await prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `msg_vitest_${input.providerCode}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
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
      isActive: input.active ?? true,
    },
  });
}

function authPostMessages(token: string, body: object, idempotencyKey?: string) {
  const builder = request(app).post("/messages").set("Authorization", `Bearer ${token}`).send(body);

  return idempotencyKey === undefined ? builder : builder.set("Idempotency-Key", idempotencyKey);
}

describe("Messages API", () => {
  beforeAll(async () => {
    await ensureSeedData();
    await cleanTransactionalData(prisma);
  });

  afterAll(async () => {
    await cleanTransactionalData(prisma);
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("executes a new message with one or multiple owned destinations and records delivery attempts", async () => {
    const { user, token } = await createUserAndLogin();
    const telegramTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const discordTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord });

    const response = await authPostMessages(token, {
      content: "Hello team",
      destinations: [
        { provider: "telegram", targetId: telegramTarget.id },
        { provider: "discord", targetId: discordTarget.id },
      ],
    }).expect(201);

    expect(response.body).toMatchObject({ content: "Hello team", status: "success" });
    expect(response.body.messageId).toEqual(expect.any(String));
    expect(response.body.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "telegram", targetId: telegramTarget.id, status: "success" }),
        expect.objectContaining({ provider: "discord", targetId: discordTarget.id, status: "success" }),
      ]),
    );

    const attempts = await prisma.deliveryAttempt.count({
      where: {
        delivery: {
          messageId: response.body.messageId,
        },
      },
    });
    expect(attempts).toBe(2);
  });

  it("rejects invalid create requests and does not persist partial messages", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const foreign = await createUserAndLogin();
    const foreignTarget = await createTarget({ userId: foreign.user.id, providerCode: ProviderCode.telegram });

    await authPostMessages(token, { content: " ", destinations: [{ provider: "telegram", targetId: target.id }] }).expect(400);
    await authPostMessages(token, { content: "Hello", destinations: [] }).expect(400);
    await authPostMessages(token, {
      content: "Hello",
      destinations: [
        { provider: "telegram", targetId: target.id },
        { provider: "telegram", targetId: target.id },
      ],
    }).expect(400);
    await authPostMessages(token, { content: "Hello", destinations: [{ provider: "unknown", targetId: target.id }] }).expect(400);
    await authPostMessages(token, { content: "Hello", destinations: [{ provider: "slack", targetId: target.id }] }).expect(400);
    await authPostMessages(token, { content: "Hello", destinations: [{ provider: "telegram", targetId: foreignTarget.id }] }).expect(400);

    const before = await prisma.message.count({ where: { userId: user.id } });
    await authPostMessages(token, {
      content: "Atomic",
      destinations: [
        { provider: "telegram", targetId: target.id },
        { provider: "discord", targetId: target.id },
      ],
    }).expect(400);
    await request(app).post("/messages").send({ content: "Hello", destinations: [{ provider: "telegram", targetId: target.id }] }).expect(401);

    const after = await prisma.message.count({ where: { userId: user.id } });
    expect(after).toBe(before);
  });

  it("handles per-user idempotency including order-independent destinations and conflicts", async () => {
    const { user, token } = await createUserAndLogin();
    const other = await createUserAndLogin();
    const telegramTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const discordTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord });
    const otherTarget = await createTarget({ userId: other.user.id, providerCode: ProviderCode.telegram });
    const key = `key_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

    const body = {
      content: "Idempotent",
      destinations: [
        { provider: "telegram", targetId: telegramTarget.id },
        { provider: "discord", targetId: discordTarget.id },
      ],
    };

    const first = await authPostMessages(token, body, key).expect(201);
    const replay = await authPostMessages(
      token,
      {
        content: "Idempotent",
        destinations: [...body.destinations].reverse(),
      },
      key,
    ).expect(200);

    expect(replay.body.messageId).toBe(first.body.messageId);
    expect(await prisma.message.count({ where: { userId: user.id, idempotencyKey: key } })).toBe(1);

    await authPostMessages(token, { content: "Changed", destinations: body.destinations }, key).expect(409);

    await authPostMessages(other.token, { content: "Idempotent", destinations: [{ provider: "telegram", targetId: otherTarget.id }] }, key).expect(201);
  });

  it("supports concurrent idempotent creates by recovering from unique conflicts", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const key = `race_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const body = { content: "Concurrent", destinations: [{ provider: "telegram", targetId: target.id }] };

    const responses = await Promise.all([authPostMessages(token, body, key), authPostMessages(token, body, key)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.messageId).toBe(responses[1].body.messageId);
    expect(await prisma.message.count({ where: { userId: user.id, idempotencyKey: key } })).toBe(1);
  });

  it("lists and returns details only within the authenticated user's scope", async () => {
    const { user, token } = await createUserAndLogin();
    const other = await createUserAndLogin();
    const telegramTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const discordTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord });
    const otherTarget = await createTarget({ userId: other.user.id, providerCode: ProviderCode.telegram });

    const telegram = await authPostMessages(token, {
      content: "Telegram only",
      destinations: [{ provider: "telegram", targetId: telegramTarget.id }],
    }).expect(201);
    const discord = await authPostMessages(token, {
      content: "Discord only",
      destinations: [{ provider: "discord", targetId: discordTarget.id }],
    }).expect(201);
    const foreign = await authPostMessages(other.token, {
      content: "Foreign",
      destinations: [{ provider: "telegram", targetId: otherTarget.id }],
    }).expect(201);

    const list = await request(app).get("/messages?provider=telegram&status=success").set("Authorization", `Bearer ${token}`).expect(200);
    expect(list.body.messages.map((message: { messageId: string }) => message.messageId)).toContain(telegram.body.messageId);
    expect(list.body.messages.map((message: { messageId: string }) => message.messageId)).not.toContain(discord.body.messageId);
    expect(list.body.messages.map((message: { messageId: string }) => message.messageId)).not.toContain(foreign.body.messageId);

    await request(app).get("/messages?status=bad").set("Authorization", `Bearer ${token}`).expect(400);
    await request(app).get("/messages?from=not-a-date").set("Authorization", `Bearer ${token}`).expect(400);

    const detail = await request(app).get(`/messages/${telegram.body.messageId}`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(detail.body.messageId).toBe(telegram.body.messageId);

    await request(app).get(`/messages/${foreign.body.messageId}`).set("Authorization", `Bearer ${token}`).expect(404);
    await request(app).get("/messages/not-a-uuid").set("Authorization", `Bearer ${token}`).expect(400);
  });
});
