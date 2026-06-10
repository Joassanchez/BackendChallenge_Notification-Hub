import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, RoleCode } from "../../src/generated/prisma/client.js";
import { cleanTransactionalData } from "../helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

const { createApp } = await import("../../src/app.js");
const { prisma: appPrisma } = await import("../../src/shared/database/prisma.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const app = createApp();

async function ensureSeedData() {
  const userRole = await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: { code: RoleCode.USER, name: "Default user" },
  });

  const adminRole = await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    update: {},
    create: { code: RoleCode.ADMIN, name: "Administrator" },
  });

  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminPasswordHash,
      isActive: true,
    },
    create: {
      username: "admin",
      email: "admin@notificationhub.local",
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
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

function uniqueUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    username: `pnt_vitest_${suffix}`,
    email: `pnt_vitest_${suffix}@example.com`,
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

async function adminToken() {
  const login = await request(app).post("/auth/login").send({ username: "admin", password: "Admin123!" }).expect(200);

  return login.body.accessToken as string;
}

async function createConnection(providerCode: ProviderCode, input?: { active?: boolean; secretRef?: string | null }) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: providerCode } });

  return prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `pnt_vitest_${providerCode}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      authType: "test",
      secretRef: input?.secretRef ?? null,
      config: { environment: "test" },
      isActive: input?.active ?? true,
    },
  });
}

async function createTarget(input: {
  userId: string;
  providerCode: ProviderCode;
  connectionId: string;
  externalTargetId?: string;
  targetType?: string;
  active?: boolean;
}) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: input.providerCode } });

  return prisma.notificationTarget.create({
    data: {
      userId: input.userId,
      providerId: provider.id,
      providerConnectionId: input.connectionId,
      externalTargetId: input.externalTargetId ?? `external_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      targetType: input.targetType ?? "chat",
      displayName: "Seeded target",
      isActive: input.active ?? true,
    },
  });
}

describe("Providers and notification targets foundation", () => {
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

  it("lists only active providers for authenticated users and rejects anonymous requests", async () => {
    const { token } = await createUserAndLogin();

    await request(app).get("/providers").expect(401);

    const response = await request(app).get("/providers").set("Authorization", `Bearer ${token}`).expect(200);

    expect(response.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "telegram", name: "Telegram" }),
        expect.objectContaining({ code: "discord", name: "Discord" }),
      ]),
    );
    expect(response.body.providers).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "slack" })]));
    expect(response.body.providers[0]).not.toHaveProperty("secretRef");
    expect(response.body.providers[0]).not.toHaveProperty("connections");
  });

  it("lists provider connections only for admins and masks secret references", async () => {
    const { token } = await createUserAndLogin();
    const admin = await adminToken();
    await createConnection(ProviderCode.telegram, { secretRef: "vault://telegram" });
    await createConnection(ProviderCode.discord);

    await request(app).get("/admin/provider-connections").expect(401);
    await request(app).get("/admin/provider-connections").set("Authorization", `Bearer ${token}`).expect(403);

    const response = await request(app).get("/admin/provider-connections").set("Authorization", `Bearer ${admin}`).expect(200);
    const testConnections = response.body.providerConnections.filter((connection: { name: string }) =>
      connection.name.startsWith("pnt_vitest_"),
    );

    expect(testConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCode: "telegram", maskedSecretRef: "***" }),
        expect.objectContaining({ providerCode: "discord", maskedSecretRef: null }),
      ]),
    );
    expect(testConnections[0]).not.toHaveProperty("secretRef");
    expect(JSON.stringify(response.body)).not.toContain("vault://telegram");
  });

  it("creates targets with server-side connection resolution and lists only the owner scope", async () => {
    const owner = await createUserAndLogin();
    const foreign = await createUserAndLogin();
    const connection = await createConnection(ProviderCode.telegram);
    const foreignTarget = await createTarget({
      userId: foreign.user.id,
      providerCode: ProviderCode.telegram,
      connectionId: connection.id,
      externalTargetId: "foreign-chat",
    });

    const created = await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        provider: "telegram",
        externalTargetId: "owner-chat",
        targetType: "chat",
        displayName: "Owner chat",
        metadata: { chatName: "general" },
        ignored: "ignored",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      provider: "telegram",
      externalTargetId: "owner-chat",
      targetType: "chat",
      displayName: "Owner chat",
      metadata: { chatName: "general" },
      isActive: true,
    });
    expect(created.body).not.toHaveProperty("providerConnectionId");
    expect(created.body).not.toHaveProperty("secretRef");

    const list = await request(app).get("/notification-targets").set("Authorization", `Bearer ${owner.token}`).expect(200);
    expect(list.body.targets.map((target: { id: string }) => target.id)).toContain(created.body.id);
    expect(list.body.targets.map((target: { id: string }) => target.id)).not.toContain(foreignTarget.id);
  });

  it("rejects invalid create payloads and duplicate active targets", async () => {
    const { token } = await createUserAndLogin();
    await createConnection(ProviderCode.telegram);
    await createConnection(ProviderCode.discord, { active: false });

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram", providerConnectionId: "client-controlled", externalTargetId: "a", targetType: "chat" })
      .expect(400);

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "slack", externalTargetId: "a", targetType: "chat" })
      .expect(400);

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "discord", externalTargetId: "a", targetType: "chat" })
      .expect(400);

    const first = await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram", externalTargetId: "dup-chat", targetType: "chat" })
      .expect(201);

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "telegram", externalTargetId: first.body.externalTargetId, targetType: "chat" })
      .expect(409);
  });

  it("accepts discord channel targetType alongside webhook", async () => {
    const { token } = await createUserAndLogin();
    await createConnection(ProviderCode.discord, { secretRef: "DISCORD_BOT_TOKEN" });

    const created = await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "discord",
        externalTargetId: "discord-channel-1",
        targetType: "channel",
        displayName: "General channel",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      provider: "discord",
      externalTargetId: "discord-channel-1",
      targetType: "channel",
      displayName: "General channel",
    });
  });

  it("rejects zero and multiple active connection resolution", async () => {
    const { token } = await createUserAndLogin();

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "discord", externalTargetId: "no-connection", targetType: "webhook" })
      .expect(400);

    await createConnection(ProviderCode.discord);
    await createConnection(ProviderCode.discord);

    await request(app)
      .post("/notification-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "discord", externalTargetId: "ambiguous", targetType: "webhook" })
      .expect(400);
  });

  it("updates editable fields and hides missing or foreign targets", async () => {
    const owner = await createUserAndLogin();
    const foreign = await createUserAndLogin();
    const connection = await createConnection(ProviderCode.telegram);
    const ownTarget = await createTarget({ userId: owner.user.id, providerCode: ProviderCode.telegram, connectionId: connection.id });
    const foreignTarget = await createTarget({ userId: foreign.user.id, providerCode: ProviderCode.telegram, connectionId: connection.id });

    const updated = await request(app)
      .patch(`/notification-targets/${ownTarget.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ displayName: "Renamed", metadata: { muted: false } })
      .expect(200);

    expect(updated.body).toMatchObject({ displayName: "Renamed", metadata: { muted: false } });

    await request(app)
      .patch(`/notification-targets/${ownTarget.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ externalTargetId: "new-destination" })
      .expect(400);

    await request(app)
      .patch(`/notification-targets/${ownTarget.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ unknown: "ignored?" })
      .expect(400);

    await request(app)
      .patch(`/notification-targets/${foreignTarget.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ displayName: "Leak?" })
      .expect(404);

    await request(app)
      .patch("/notification-targets/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ displayName: "Missing" })
      .expect(404);
  });

  it("supports activation lifecycle and rejects duplicate reactivation", async () => {
    const { user, token } = await createUserAndLogin();
    const connection = await createConnection(ProviderCode.telegram);
    const externalTargetId = `reactivate_${Date.now()}`;
    const inactive = await createTarget({
      userId: user.id,
      providerCode: ProviderCode.telegram,
      connectionId: connection.id,
      externalTargetId,
      active: false,
    });

    const activated = await request(app)
      .patch(`/notification-targets/${inactive.id}/activate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(activated.body.isActive).toBe(true);

    const deactivated = await request(app)
      .patch(`/notification-targets/${inactive.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(deactivated.body.isActive).toBe(false);

    await createTarget({
      userId: user.id,
      providerCode: ProviderCode.telegram,
      connectionId: connection.id,
      externalTargetId,
      active: true,
    });

    await request(app).patch(`/notification-targets/${inactive.id}/activate`).set("Authorization", `Bearer ${token}`).expect(409);
    await request(app)
      .patch("/notification-targets/00000000-0000-4000-8000-000000000000/deactivate")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
