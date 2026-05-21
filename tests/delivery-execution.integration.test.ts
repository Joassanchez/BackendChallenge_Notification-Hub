import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { AttemptStatus, DeliveryStatus, Prisma, PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import type { DeliveryProviderAdapter, DeliveryProviderResult } from "../src/modules/delivery-execution/delivery-provider-adapter.js";
import { redactResolvedSecretFromProviderResponse, redactResolvedSecretFromString } from "../src/modules/delivery-execution/delivery-provider-adapter.js";

process.env.DATABASE_URL ??= "postgresql://notification_user:notification_password@localhost:5432/notification_hub_db?schema=public";
process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

const { createApp } = await import("../src/app.js");
const { prisma: appPrisma } = await import("../src/shared/database/prisma.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type AdapterBehavior = DeliveryProviderResult | "throw";

const adapterCalls: Array<{ provider: ProviderCode; externalTargetId: string }> = [];
const adapterBehaviors = new Map<string, AdapterBehavior>();

function fakeAdapter(provider: ProviderCode): DeliveryProviderAdapter {
  return {
    async send(input) {
      adapterCalls.push({ provider, externalTargetId: input.externalTargetId });
      const behavior = adapterBehaviors.get(input.externalTargetId) ?? successResult(`${provider}_${input.externalTargetId}`);

      if (behavior === "throw") {
        throw new Error(`${provider} exploded with ${input.resolvedSecret ?? "no-secret"}`);
      }

      return behavior;
    },
  };
}

const app = createApp({
  deliveryAdapters: {
    [ProviderCode.telegram]: fakeAdapter(ProviderCode.telegram),
    [ProviderCode.discord]: fakeAdapter(ProviderCode.discord),
  },
});

async function ensureSeedData() {
  await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: { code: RoleCode.USER, name: "Default user" },
  });

  for (const provider of [ProviderCode.telegram, ProviderCode.discord]) {
    await prisma.provider.upsert({
      where: { code: provider },
      update: { isActive: true },
      create: { code: provider, name: provider },
    });
  }
}

async function deleteDeliveryTestData() {
  await prisma.message.deleteMany({ where: { user: { username: { startsWith: "delivery_vitest_" } } } });
  await prisma.notificationTarget.deleteMany({ where: { user: { username: { startsWith: "delivery_vitest_" } } } });
  await prisma.providerConnection.deleteMany({ where: { name: { startsWith: "delivery_vitest_" } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: "delivery_vitest_" } } });
}

function uniqueSuffix() {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function createUserAndLogin() {
  const suffix = uniqueSuffix();
  const input = {
    username: `delivery_vitest_${suffix}`,
    email: `delivery_vitest_${suffix}@example.com`,
    password: "Password123!",
  };

  await request(app).post("/auth/register").send(input).expect(201);
  const login = await request(app).post("/auth/login").send({ username: input.username, password: input.password }).expect(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });

  return { user, token: login.body.accessToken as string };
}

async function createTarget(input: {
  userId: string;
  providerCode: ProviderCode;
  externalTargetId?: string;
  targetType?: string;
  secretRef?: string | null;
  config?: Prisma.InputJsonValue;
}) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: input.providerCode } });
  const connection = await prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `delivery_vitest_${input.providerCode}_${uniqueSuffix()}`,
      authType: "test",
      secretRef: input.secretRef ?? null,
      config: input.config ?? Prisma.JsonNull,
      isActive: true,
    },
  });

  return prisma.notificationTarget.create({
    data: {
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: connection.id,
      externalTargetId: input.externalTargetId ?? `external_${uniqueSuffix()}`,
      targetType: input.targetType ?? (input.providerCode === ProviderCode.telegram ? "chat" : "webhook"),
      displayName: "Delivery test target",
      isActive: true,
    },
  });
}

function authPostMessages(token: string, body: object, idempotencyKey?: string) {
  const builder = request(app).post("/messages").set("Authorization", `Bearer ${token}`).send(body);
  return idempotencyKey === undefined ? builder : builder.set("Idempotency-Key", idempotencyKey);
}

function successResult(providerMessageId: string): DeliveryProviderResult {
  return { kind: "success", httpStatusCode: 200, providerMessageId, providerResponse: { ok: true } };
}

async function attemptsForMessage(messageId: string) {
  return prisma.deliveryAttempt.findMany({
    where: { delivery: { messageId } },
    orderBy: { attemptedAt: "asc" },
    include: { delivery: true },
  });
}

describe("Delivery Execution", () => {
  beforeAll(async () => {
    await ensureSeedData();
    await deleteDeliveryTestData();
  });

  afterAll(async () => {
    await deleteDeliveryTestData();
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("returns persisted post-execution statuses and creates successful attempts", async () => {
    const { user, token } = await createUserAndLogin();
    const telegramTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const discordTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord });

    const response = await authPostMessages(token, {
      content: "Delivery success",
      destinations: [
        { provider: "telegram", targetId: telegramTarget.id },
        { provider: "discord", targetId: discordTarget.id },
      ],
    }).expect(201);

    expect(response.body.status).toBe("success");
    expect(response.body.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: telegramTarget.id, status: "success" }),
        expect.objectContaining({ targetId: discordTarget.id, status: "success" }),
      ]),
    );

    const attempts = await attemptsForMessage(response.body.messageId as string);
    expect(attempts).toHaveLength(2);
    expect(attempts.every((attempt) => attempt.status === AttemptStatus.success)).toBe(true);
    expect(attempts.every((attempt) => attempt.delivery.status === DeliveryStatus.success)).toBe(true);
  });

  it("redacts resolved secrets embedded in provider responses before persistence", () => {
    const secret = "super-secret-token";

    const response = redactResolvedSecretFromProviderResponse(
      {
        url: `https://api.example.test/${secret}/send`,
        nested: {
          message: `token=${secret}`,
          [`key-${secret}`]: "value",
        },
        list: [`prefix-${secret}-suffix`],
      },
      secret,
    );

    expect(JSON.stringify(response)).not.toContain(secret);
    expect(redactResolvedSecretFromString(`Bearer ${secret}`, secret)).toBe("Bearer [REDACTED]");
    expect(response).toEqual({
      url: "https://api.example.test/[REDACTED]/send",
      nested: {
        message: "token=[REDACTED]",
        "key-[REDACTED]": "value",
      },
      list: ["prefix-[REDACTED]-suffix"],
    });
  });

  it("does not execute adapters or create attempts for idempotency replay", async () => {
    const { user, token } = await createUserAndLogin();
    const target = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram });
    const key = `delivery_key_${uniqueSuffix()}`;
    const body = { content: "Idempotent delivery", destinations: [{ provider: "telegram", targetId: target.id }] };

    adapterCalls.length = 0;
    const first = await authPostMessages(token, body, key).expect(201);
    const callCountAfterFirst = adapterCalls.length;
    const replay = await authPostMessages(token, body, key).expect(200);

    expect(replay.body.messageId).toBe(first.body.messageId);
    expect(adapterCalls).toHaveLength(callCountAfterFirst);
    expect(await prisma.deliveryAttempt.count({ where: { delivery: { messageId: first.body.messageId } } })).toBe(1);
  });

  it("maps missing config, provider errors, timeout, and thrown exceptions to controlled attempts", async () => {
    const { user, token } = await createUserAndLogin();
    const missingSecret = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram, secretRef: `MISSING_${uniqueSuffix()}` });
    const providerError = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram, externalTargetId: `provider_error_${uniqueSuffix()}` });
    const timeout = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram, externalTargetId: `timeout_${uniqueSuffix()}` });
    const throwSecretRef = `THROW_SECRET_${uniqueSuffix()}`;
    process.env[throwSecretRef] = "throw-secret-token";
    const thrown = await createTarget({
      userId: user.id,
      providerCode: ProviderCode.telegram,
      externalTargetId: `throw_${uniqueSuffix()}`,
      secretRef: throwSecretRef,
    });

    adapterBehaviors.set(providerError.externalTargetId, {
      kind: "provider_error",
      httpStatusCode: 502,
      errorCode: "TELEGRAM_502",
      errorMessage: "telegram provider returned 502",
      providerResponse: { error: "bad_gateway" },
    });
    adapterBehaviors.set(timeout.externalTargetId, { kind: "timeout", errorCode: "PROVIDER_TIMEOUT", errorMessage: "Provider request timed out" });
    adapterBehaviors.set(thrown.externalTargetId, "throw");

    const response = await authPostMessages(token, {
      content: "Delivery failures",
      destinations: [
        { provider: "telegram", targetId: missingSecret.id },
        { provider: "telegram", targetId: providerError.id },
        { provider: "telegram", targetId: timeout.id },
        { provider: "telegram", targetId: thrown.id },
      ],
    }).expect(201);

    expect(response.body.status).toBe("failed");

    const attempts = await attemptsForMessage(response.body.messageId as string);
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      AttemptStatus.failed,
      AttemptStatus.provider_error,
      AttemptStatus.provider_error,
      AttemptStatus.timeout,
    ].sort());
    expect(JSON.stringify(attempts)).not.toContain(process.env[throwSecretRef]);
    expect(attempts.every((attempt) => attempt.delivery.status === DeliveryStatus.failed)).toBe(true);
    expect(attempts.every((attempt) => attempt.delivery.status !== DeliveryStatus.processing)).toBe(true);
  });

  it("aggregates all success, all failed, and mixed outcomes", async () => {
    const { user, token } = await createUserAndLogin();
    const successTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram, externalTargetId: `success_${uniqueSuffix()}` });
    const failedTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.telegram, externalTargetId: `failed_${uniqueSuffix()}` });
    const anotherFailedTarget = await createTarget({ userId: user.id, providerCode: ProviderCode.discord, externalTargetId: `failed_${uniqueSuffix()}` });

    adapterBehaviors.set(failedTarget.externalTargetId, { kind: "failed", errorCode: "INVALID_TARGET", errorMessage: "Invalid target" });
    adapterBehaviors.set(anotherFailedTarget.externalTargetId, { kind: "failed", errorCode: "INVALID_TARGET", errorMessage: "Invalid target" });

    const success = await authPostMessages(token, {
      content: "All success",
      destinations: [{ provider: "telegram", targetId: successTarget.id }],
    }).expect(201);
    const failed = await authPostMessages(token, {
      content: "All failed",
      destinations: [
        { provider: "telegram", targetId: failedTarget.id },
        { provider: "discord", targetId: anotherFailedTarget.id },
      ],
    }).expect(201);
    const partial = await authPostMessages(token, {
      content: "Partial",
      destinations: [
        { provider: "telegram", targetId: successTarget.id },
        { provider: "telegram", targetId: failedTarget.id },
      ],
    }).expect(201);

    expect(success.body.status).toBe("success");
    expect(failed.body.status).toBe("failed");
    expect(partial.body.status).toBe("partial");

    for (const messageId of [success.body.messageId, failed.body.messageId, partial.body.messageId] as string[]) {
      expect(await prisma.messageDelivery.count({ where: { messageId, status: DeliveryStatus.processing } })).toBe(0);
    }
  });
});
