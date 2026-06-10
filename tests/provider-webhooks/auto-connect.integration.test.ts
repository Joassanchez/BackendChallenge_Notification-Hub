import { generateKeyPairSync, sign as cryptoSign, createPrivateKey } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../../src/generated/prisma/client.js";
import { cleanTransactionalData } from "../helpers/db-cleanup.js";

// Generate a test Ed25519 keypair for Discord signature verification
const { publicKey: spkiPublicKey, privateKey: pkcs8PrivateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});
const rawPublicKey = spkiPublicKey.slice(-32);
const publicKeyHex = rawPublicKey.toString("hex");
const privateKeyObj = createPrivateKey({
  key: pkcs8PrivateKey,
  format: "der",
  type: "pkcs8",
});

function signDiscordPayload(timestamp: string, rawBody: string): string {
  const data = Buffer.from(timestamp + rawBody);
  const sig = cryptoSign(null, data, privateKeyObj);
  return sig.toString("hex");
}

// Set env vars BEFORE importing createApp so webhook routers are enabled
process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret-token";
process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
process.env.TELEGRAM_BOT_USERNAME = "TestNotificationBot";

const { createApp } = await import("../../src/app.js");
const { prisma: appPrisma } = await import("../../src/shared/database/prisma.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const app = createApp();

async function ensureSeedData() {
  await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: { code: RoleCode.USER, name: "Default user" },
  });

  await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    update: {},
    create: { code: RoleCode.ADMIN, name: "Administrator" },
  });

  for (const provider of [
    { code: ProviderCode.telegram, name: "Telegram", isActive: true },
    { code: ProviderCode.discord, name: "Discord", isActive: true },
  ]) {
    await prisma.provider.upsert({
      where: { code: provider.code },
      update: { name: provider.name, isActive: provider.isActive },
      create: provider,
    });
  }

  // Seed connections needed for webhook handlers
  const telegramProvider = await prisma.provider.findUniqueOrThrow({ where: { code: ProviderCode.telegram } });
  const discordProvider = await prisma.provider.findUniqueOrThrow({ where: { code: ProviderCode.discord } });

  await prisma.providerConnection.upsert({
    where: { id: "00000000-0000-4000-a000-000000000001" },
    update: { isActive: true },
    create: {
      id: "00000000-0000-4000-a000-000000000001",
      providerId: telegramProvider.id,
      name: "Telegram Bot Token",
      authType: "bot-token",
      secretRef: "TELEGRAM_BOT_TOKEN",
      config: {},
      isActive: true,
    },
  });

  await prisma.providerConnection.upsert({
    where: { id: "00000000-0000-4000-a000-000000000002" },
    update: { isActive: true },
    create: {
      id: "00000000-0000-4000-a000-000000000002",
      providerId: discordProvider.id,
      name: "Discord Bot Token",
      authType: "bot-token",
      secretRef: "DISCORD_BOT_TOKEN",
      config: {},
      isActive: true,
    },
  });

  await prisma.providerConnection.upsert({
    where: { id: "00000000-0000-4000-a000-000000000003" },
    update: { isActive: true },
    create: {
      id: "00000000-0000-4000-a000-000000000003",
      providerId: discordProvider.id,
      name: "Discord Webhook",
      authType: "webhook",
      secretRef: "DISCORD_WEBHOOK_URL",
      config: {},
      isActive: true,
    },
  });
}

function uniqueSuffix() {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function createUserAndLogin() {
  const suffix = uniqueSuffix();
  const input = {
    username: `auto_vitest_${suffix}`,
    email: `auto_vitest_${suffix}@example.com`,
    password: "Password123!",
  };

  await request(app).post("/auth/register").send(input).expect(201);
  const login = await request(app).post("/auth/login").send({ username: input.username, password: input.password }).expect(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });

  return { user, token: login.body.accessToken as string };
}

describe("Auto-connect: connect-code → webhook → target creation", () => {
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
    await appPrisma.$disconnect();
  });

  it("Telegram: connect-code → webhook → target created", async () => {
    const { user, token } = await createUserAndLogin();

    // 1. Request connect code
    const codeRes = await request(app)
      .post("/notification-targets/connect-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram" })
      .expect(201);

    const code = codeRes.body.code as string;
    expect(code).toMatch(/^[0-9a-f]{6}$/);

    // 2. Simulate Telegram webhook with /start CODE
    await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-token")
      .send({
        update_id: 1,
        message: {
          message_id: 1,
          text: `/start ${code}`,
          chat: { id: 12345 },
        },
      })
      .expect(200);

    // 3. Verify target was auto-created
    const list = await request(app)
      .get("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const targets = list.body.targets as Array<{ externalTargetId: string; targetType: string; provider: string }>;
    const created = targets.find((t) => t.externalTargetId === "12345" && t.targetType === "chat");
    expect(created).toBeDefined();
    expect(created!.provider).toBe("telegram");
  });

  it("Discord: connect-code → webhook → target created", async () => {
    const { user, token } = await createUserAndLogin();

    // 1. Request connect code for discord
    const codeRes = await request(app)
      .post("/notification-targets/connect-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "discord" })
      .expect(201);

    const code = codeRes.body.code as string;
    expect(code).toMatch(/^[0-9a-f]{6}$/);

    // 2. Build Discord interaction body as JSON string
    const interactionBody = JSON.stringify({
      type: 2,
      data: {
        name: "connect",
        options: [{ name: "code", value: code }],
      },
      channel_id: "channel-123",
      token: "interaction-token-xyz",
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signDiscordPayload(timestamp, interactionBody);

    // 3. Simulate Discord webhook with valid Ed25519 signature
    // Send as string with application/json content type so express.raw() parses it as Buffer
    await request(app)
      .post("/webhooks/discord")
      .set("X-Signature-Ed25519", signature)
      .set("X-Signature-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(interactionBody)
      .expect(200);

    // 4. Verify target was auto-created
    const list = await request(app)
      .get("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const targets = list.body.targets as Array<{ externalTargetId: string; targetType: string; provider: string }>;
    const created = targets.find((t) => t.externalTargetId === "channel-123" && t.targetType === "channel");
    expect(created).toBeDefined();
    expect(created!.provider).toBe("discord");
  });

  it("Code already used rejected", async () => {
    const { user, token } = await createUserAndLogin();

    // Get connect code
    const codeRes = await request(app)
      .post("/notification-targets/connect-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram" })
      .expect(201);

    const code = codeRes.body.code as string;

    // Use the code once (this consumes it)
    await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-token")
      .send({
        update_id: 2,
        message: {
          message_id: 2,
          text: `/start ${code}`,
          chat: { id: 99999 },
        },
      })
      .expect(200);

    // Attempt to reuse the same code — should be already consumed
    const webhookRes = await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-token")
      .send({
        update_id: 3,
        message: {
          message_id: 3,
          text: `/start ${code}`,
          chat: { id: 88888 },
        },
      });

    // The webhook returns 200 (Telegram expects a response) with error message
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toHaveProperty("method", "sendMessage");
    expect(webhookRes.body.text).toContain("Error: code already used");
  });

  it("Duplicate target is idempotent", async () => {
    const { user, token } = await createUserAndLogin();

    // Complete flow once
    const codeRes1 = await request(app)
      .post("/notification-targets/connect-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram" })
      .expect(201);

    const code1 = codeRes1.body.code as string;

    await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-token")
      .send({
        update_id: 3,
        message: {
          message_id: 3,
          text: `/start ${code1}`,
          chat: { id: 12345 },
        },
      })
      .expect(200);

    // Verify target created
    const list1 = await request(app)
      .get("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list1.body.targets).toHaveLength(1);

    // Generate a new code and repeat for same chat
    const codeRes2 = await request(app)
      .post("/notification-targets/connect-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram" })
      .expect(201);

    const code2 = codeRes2.body.code as string;

    await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-token")
      .send({
        update_id: 4,
        message: {
          message_id: 4,
          text: `/start ${code2}`,
          chat: { id: 12345 },
        },
      })
      .expect(200);

    // Should still have only 1 target (idempotent)
    const list2 = await request(app)
      .get("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list2.body.targets).toHaveLength(1);
  });

  it("Invalid Telegram secret token returns 403", async () => {
    await request(app)
      .post("/webhooks/telegram")
      .set("X-Telegram-Bot-Api-Secret-Token", "wrong-secret-token")
      .send({
        update_id: 5,
        message: {
          message_id: 5,
          text: "/start ABC123",
          chat: { id: 12345 },
        },
      })
      .expect(403);
  });

  it("Invalid Discord signature returns 401", async () => {
    const interactionBody = JSON.stringify({
      type: 2,
      data: {
        name: "connect",
        options: [{ name: "code", value: "BADCODE" }],
      },
      channel_id: "channel-456",
      token: "test-token",
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();

    await request(app)
      .post("/webhooks/discord")
      .set("X-Signature-Ed25519", "deadbeef")
      .set("X-Signature-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(interactionBody)
      .expect(401);
  });
});
