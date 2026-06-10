import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../../src/generated/prisma/client.js";
import { ConnectCodeService } from "../../src/modules/provider-webhooks/connect-code/connect-code.service.js";
import { createNotificationTargetRouter } from "../../src/modules/notifications/notification-targets/notification-target.routes.js";
import { NotificationTargetService } from "../../src/modules/notifications/notification-targets/notification-target.service.js";
import { NotificationTargetRepository } from "../../src/modules/notifications/notification-targets/notification-target.repository.js";
import { cleanTransactionalData } from "../helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const { prisma: appPrisma } = await import("../../src/shared/database/prisma.js");

const repository = new NotificationTargetRepository(prisma);
const notificationTargetService = new NotificationTargetService(repository);
const connectCodeService = new ConnectCodeService("TestBot");

/** Store the test user ID generated during seed, used in the fake auth middleware. */
let testUserId = "";

/**
 * Minimal Express app for router isolation testing.
 * Injects a fake auth middleware so the controller's requireAuth() passes.
 */
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Fake auth middleware — sets request.auth to simulate authenticated user
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).auth = {
      id: testUserId,
      username: "testuser",
      email: "test@example.com",
      roleCodes: ["USER"],
    };
    next();
  });

  app.use(
    "/notification-targets",
    createNotificationTargetRouter(notificationTargetService, connectCodeService),
  );

  return app;
}

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

  // Create test user with auto-generated UUID
  const suffix = crypto.randomUUID().split("-")[0]!;
  const user = await prisma.user.create({
    data: {
      username: `ccr_test_${suffix}`,
      email: `ccr_test_${suffix}@example.com`,
      passwordHash: "hashed",
    },
  });
  testUserId = user.id;
}

describe("Notification-targets connect-code route", () => {
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

  const app = createTestApp();

  it("returns 201 with code, expiresAt, and connectUrl for authenticated user", async () => {
    const response = await request(app)
      .post("/notification-targets/connect-code")
      .send({ provider: "telegram" })
      .expect(201);

    expect(response.body).toEqual({
      code: expect.stringMatching(/^[0-9a-f]{6}$/),
      expiresAt: expect.any(String),
      connectUrl: expect.any(String),
    });
    expect(() => new Date(response.body.expiresAt)).not.toThrow();
  });

  it("returns 201 for discord provider with slash-command connectUrl", async () => {
    const response = await request(app)
      .post("/notification-targets/connect-code")
      .send({ provider: "discord" })
      .expect(201);

    expect(response.body.connectUrl).toMatch(/^\/connect [0-9a-f]{6}$/);
  });

  it("returns 400 for missing provider field", async () => {
    await request(app)
      .post("/notification-targets/connect-code")
      .send({})
      .expect(400);
  });
});
