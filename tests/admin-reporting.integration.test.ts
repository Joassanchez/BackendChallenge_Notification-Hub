import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { DeliveryStatus, MessageStatus, PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import { cleanTransactionalData } from "./helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";
process.env.DAILY_MESSAGE_LIMIT = "7";

const { createApp } = await import("../src/app.js");
const { prisma: appPrisma } = await import("../src/shared/database/prisma.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const app = createApp();
const TEST_PASSWORD = "Password123!";
const TEST_PREFIX = "admin_reporting_vitest_";
const runPrefix = `${TEST_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

type AdminDeliveryDto = {
  id: string;
  provider: string;
  targetType: string;
  externalTargetId: string;
  status: string;
  attemptsCount: number;
};

type AdminMessageDto = {
  id: string;
  userId: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deliveries: AdminDeliveryDto[];
};

type AdminMetricsDto = {
  userId: string;
  email: string | null;
  username: string;
  totalMessagesSent: number;
  sentToday: number;
  dailyLimit: number;
  remainingToday: number;
};

type SeededUser = {
  id: string;
  username: string;
  email: string | null;
};

type SeededMessage = {
  id: string;
  userId: string;
  content: string;
  status: MessageStatus;
  createdAt: Date;
};

type Fixtures = {
  admin: SeededUser;
  sender: SeededUser;
  otherSender: SeededUser;
  zeroActivityUser: SeededUser;
  adminToken: string;
  userToken: string;
  messages: {
    newestTelegram: SeededMessage;
    failedDiscord: SeededMessage;
    oldestSlack: SeededMessage;
  };
  targets: {
    primaryTelegram: { externalTargetId: string; targetType: string };
    secondaryTelegram: { externalTargetId: string; targetType: string };
    discord: { externalTargetId: string; targetType: string };
    slack: { externalTargetId: string; targetType: string };
  };
};

type ReadOnlySnapshot = {
  users: number;
  messages: number;
  deliveries: number;
  dailyUsage: number;
  usageRows: Array<{
    userId: string;
    usageDate: string;
    sentCount: number;
    dailyLimit: number;
  }>;
};

let fixtures: Fixtures;

describe("Admin reporting API", () => {
  beforeAll(async () => {
    await ensureSeedData();
    await cleanTransactionalData(prisma);
    fixtures = await seedReportingFixtures();
  });

  afterAll(async () => {
    await cleanTransactionalData(prisma);
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("requires authentication and ADMIN authorization on both reporting endpoints", async () => {
    for (const path of ["/admin/messages", "/admin/metrics"]) {
      await request(app).get(path).expect(401);
      await request(app).get(path).set("Authorization", "Bearer bad.token.value").expect(401);
      await request(app).get(path).set("Authorization", `Bearer ${fixtures.userToken}`).expect(403);
    }
  });

  it("lists global messages in descending creation order with required message and delivery fields", async () => {
    const response = await adminGet("/admin/messages").expect(200);
    const body = response.body as { messages: AdminMessageDto[] };
    const seededMessages = body.messages.filter((message) => seededMessageIds().includes(message.id));

    expect(seededMessages.map((message) => message.id)).toEqual([
      fixtures.messages.newestTelegram.id,
      fixtures.messages.failedDiscord.id,
      fixtures.messages.oldestSlack.id,
    ]);
    expect(new Set(seededMessages.map((message) => message.userId))).toEqual(new Set([fixtures.sender.id, fixtures.otherSender.id]));

    const newest = seededMessages.find((message) => message.id === fixtures.messages.newestTelegram.id);
    if (newest === undefined) {
      throw new Error("Expected seeded newest message in admin response");
    }

    expect(newest).toEqual(
      expect.objectContaining({
        id: fixtures.messages.newestTelegram.id,
        userId: fixtures.sender.id,
        content: fixtures.messages.newestTelegram.content,
        status: fixtures.messages.newestTelegram.status,
        createdAt: fixtures.messages.newestTelegram.createdAt.toISOString(),
        updatedAt: expect.any(String),
      }),
    );
    expect(newest.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: ProviderCode.telegram,
          targetType: fixtures.targets.primaryTelegram.targetType,
          externalTargetId: fixtures.targets.primaryTelegram.externalTargetId,
          status: DeliveryStatus.success,
          attemptsCount: 3,
        }),
        expect.objectContaining({
          provider: ProviderCode.telegram,
          targetType: fixtures.targets.secondaryTelegram.targetType,
          externalTargetId: fixtures.targets.secondaryTelegram.externalTargetId,
          status: DeliveryStatus.failed,
          attemptsCount: 1,
        }),
      ]),
    );
  });

  it("filters admin messages by user, status, provider, and UTC from/to without duplicating logical messages", async () => {
    const userFiltered = await adminGet(`/admin/messages?userId=${fixtures.sender.id}`).expect(200);
    expect(seededMessageIdsFrom(userFiltered.body as { messages: AdminMessageDto[] })).toEqual([
      fixtures.messages.newestTelegram.id,
      fixtures.messages.oldestSlack.id,
    ]);

    const statusFiltered = await adminGet(`/admin/messages?status=${MessageStatus.failed}`).expect(200);
    expect(seededMessageIdsFrom(statusFiltered.body as { messages: AdminMessageDto[] })).toEqual([fixtures.messages.failedDiscord.id]);

    const providerFiltered = await adminGet(`/admin/messages?provider=${ProviderCode.telegram}`).expect(200);
    expect(seededMessageIdsFrom(providerFiltered.body as { messages: AdminMessageDto[] })).toEqual([fixtures.messages.newestTelegram.id]);

    const dateFiltered = await adminGet("/admin/messages?from=2026-01-11T00:00:00.000Z&to=2026-01-12T23:59:59.999Z").expect(200);
    expect(seededMessageIdsFrom(dateFiltered.body as { messages: AdminMessageDto[] })).toEqual([
      fixtures.messages.newestTelegram.id,
      fixtures.messages.failedDiscord.id,
    ]);
  });

  it("rejects invalid admin message filters with 400", async () => {
    for (const query of [
      "userId=not-a-uuid",
      "status=unknown",
      "provider=email",
      "from=not-a-date",
      "from=2026-01-12T00:00:00.000Z&to=2026-01-11T00:00:00.000Z",
      "from=2026-01-11T00:00:00",
    ]) {
      await adminGet(`/admin/messages?${query}`).expect(400);
    }
  });

  it("returns metrics for every user with stable seeded order and independent quota fields", async () => {
    const response = await adminGet("/admin/metrics").expect(200);
    const body = response.body as { metrics: AdminMetricsDto[] };
    const allUsersCount = await prisma.user.count();

    expect(body.metrics).toHaveLength(allUsersCount);

    const seededMetrics = body.metrics.filter((metric) => seededUserIds().includes(metric.userId));
    expect(seededMetrics.map((metric) => metric.userId)).toEqual([
      fixtures.admin.id,
      fixtures.sender.id,
      fixtures.otherSender.id,
      fixtures.zeroActivityUser.id,
    ]);

    expect(metricFor(body.metrics, fixtures.sender.id)).toEqual(
      expect.objectContaining({
        userId: fixtures.sender.id,
        email: fixtures.sender.email,
        username: fixtures.sender.username,
        totalMessagesSent: 2,
        sentToday: 2,
        dailyLimit: 5,
        remainingToday: 3,
      }),
    );
    expect(metricFor(body.metrics, fixtures.otherSender.id)).toEqual(
      expect.objectContaining({
        totalMessagesSent: 1,
        sentToday: 11,
        dailyLimit: 10,
        remainingToday: 0,
      }),
    );
    expect(metricFor(body.metrics, fixtures.zeroActivityUser.id)).toEqual(
      expect.objectContaining({
        totalMessagesSent: 0,
        sentToday: 0,
        dailyLimit: 7,
        remainingToday: 7,
      }),
    );
    expect(body.metrics.every((metric) => metric.remainingToday >= 0)).toBe(true);
  });

  it("rejects unsupported admin metrics query parameters with 400", async () => {
    await adminGet(`/admin/metrics?userId=${fixtures.sender.id}`).expect(400);
  });

  it("does not mutate users, messages, deliveries, or current usage when reporting endpoints are read", async () => {
    const before = await readOnlySnapshot();

    await adminGet("/admin/messages").expect(200);
    await adminGet("/admin/metrics").expect(200);

    await expect(readOnlySnapshot()).resolves.toEqual(before);
  });
});

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

  for (const provider of [ProviderCode.telegram, ProviderCode.discord, ProviderCode.slack]) {
    await prisma.provider.upsert({
      where: { code: provider },
      update: { isActive: true },
      create: { code: provider, name: provider, isActive: true },
    });
  }
}

async function seedReportingFixtures(): Promise<Fixtures> {
  const admin = await createUser("admin", [RoleCode.ADMIN], new Date("2026-01-01T00:00:00.000Z"));
  const sender = await createUser("sender", [RoleCode.USER], new Date("2026-01-02T00:00:00.000Z"));
  const otherSender = await createUser("other", [RoleCode.USER], new Date("2026-01-03T00:00:00.000Z"));
  const zeroActivityUser = await createUser("zero", [RoleCode.USER], new Date("2026-01-04T00:00:00.000Z"));

  const primaryTelegram = await createTarget(sender.id, ProviderCode.telegram, "chat");
  const secondaryTelegram = await createTarget(sender.id, ProviderCode.telegram, "chat");
  const slack = await createTarget(sender.id, ProviderCode.slack, "channel");
  const discord = await createTarget(otherSender.id, ProviderCode.discord, "webhook");

  const newestTelegram = await prisma.message.create({
    data: {
      userId: sender.id,
      content: "Newest telegram report fixture",
      status: MessageStatus.success,
      createdAt: new Date("2026-01-12T15:30:00.000Z"),
      updatedAt: new Date("2026-01-12T15:31:00.000Z"),
      deliveries: {
        create: [
          {
            providerId: primaryTelegram.providerId,
            targetId: primaryTelegram.id,
            status: DeliveryStatus.success,
            attemptCount: 3,
          },
          {
            providerId: secondaryTelegram.providerId,
            targetId: secondaryTelegram.id,
            status: DeliveryStatus.failed,
            attemptCount: 1,
          },
        ],
      },
    },
  });
  const failedDiscord = await prisma.message.create({
    data: {
      userId: otherSender.id,
      content: "Middle failed discord report fixture",
      status: MessageStatus.failed,
      createdAt: new Date("2026-01-11T12:00:00.000Z"),
      updatedAt: new Date("2026-01-11T12:01:00.000Z"),
      deliveries: {
        create: {
          providerId: discord.providerId,
          targetId: discord.id,
          status: DeliveryStatus.failed,
          attemptCount: 2,
        },
      },
    },
  });
  const oldestSlack = await prisma.message.create({
    data: {
      userId: sender.id,
      content: "Oldest pending slack report fixture",
      status: MessageStatus.pending,
      createdAt: new Date("2026-01-10T10:00:00.000Z"),
      updatedAt: new Date("2026-01-10T10:01:00.000Z"),
      deliveries: {
        create: {
          providerId: slack.providerId,
          targetId: slack.id,
          status: DeliveryStatus.pending,
          attemptCount: 0,
        },
      },
    },
  });

  await prisma.dailyUsage.createMany({
    data: [
      {
        userId: sender.id,
        usageDate: currentUtcUsageDate(),
        sentCount: 2,
        dailyLimit: 5,
      },
      {
        userId: otherSender.id,
        usageDate: currentUtcUsageDate(),
        sentCount: 11,
        dailyLimit: 10,
      },
    ],
  });

  return {
    admin,
    sender,
    otherSender,
    zeroActivityUser,
    adminToken: await login(admin.username),
    userToken: await login(sender.username),
    messages: { newestTelegram, failedDiscord, oldestSlack },
    targets: {
      primaryTelegram,
      secondaryTelegram,
      discord,
      slack,
    },
  };
}

async function createUser(kind: string, roles: RoleCode[], createdAt: Date): Promise<SeededUser> {
  const username = `${runPrefix}_${kind}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@example.com`,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
      createdAt,
      roles: {
        create: roles.map((code) => ({
          role: {
            connect: { code },
          },
        })),
      },
    },
  });

  return { id: user.id, username: user.username, email: user.email };
}

async function createTarget(userId: string, providerCode: ProviderCode, targetType: string) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { code: providerCode } });
  const connection = await prisma.providerConnection.create({
    data: {
      providerId: provider.id,
      name: `${runPrefix}_${providerCode}_${Math.floor(Math.random() * 1_000_000)}`,
      authType: "test",
      isActive: true,
    },
  });

  return prisma.notificationTarget.create({
    data: {
      userId,
      providerId: provider.id,
      providerConnectionId: connection.id,
      externalTargetId: `${runPrefix}_${providerCode}_external_${Math.floor(Math.random() * 1_000_000)}`,
      targetType,
      displayName: `${providerCode} reporting target`,
      isActive: true,
    },
  });
}

async function login(username: string): Promise<string> {
  const response = await request(app).post("/auth/login").send({ username, password: TEST_PASSWORD }).expect(200);
  return response.body.accessToken as string;
}

function adminGet(path: string) {
  return request(app).get(path).set("Authorization", `Bearer ${fixtures.adminToken}`);
}

function seededMessageIds() {
  return [fixtures.messages.newestTelegram.id, fixtures.messages.failedDiscord.id, fixtures.messages.oldestSlack.id];
}

function seededMessageIdsFrom(body: { messages: AdminMessageDto[] }) {
  return body.messages.map((message) => message.id).filter((id) => seededMessageIds().includes(id));
}

function seededUserIds() {
  return [fixtures.admin.id, fixtures.sender.id, fixtures.otherSender.id, fixtures.zeroActivityUser.id];
}

function metricFor(metrics: AdminMetricsDto[], userId: string): AdminMetricsDto {
  const metric = metrics.find((candidate) => candidate.userId === userId);

  if (metric === undefined) {
    throw new Error(`Expected metrics row for user ${userId}`);
  }

  return metric;
}

function currentUtcUsageDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function readOnlySnapshot(): Promise<ReadOnlySnapshot> {
  const [users, messages, deliveries, dailyUsage, usageRows] = await Promise.all([
    prisma.user.count(),
    prisma.message.count(),
    prisma.messageDelivery.count(),
    prisma.dailyUsage.count(),
    prisma.dailyUsage.findMany({
      where: {
        userId: {
          in: seededUserIds(),
        },
      },
      orderBy: [{ userId: "asc" }, { usageDate: "asc" }],
    }),
  ]);

  return {
    users,
    messages,
    deliveries,
    dailyUsage,
    usageRows: usageRows.map((row) => ({
      userId: row.userId,
      usageDate: row.usageDate.toISOString(),
      sentCount: row.sentCount,
      dailyLimit: row.dailyLimit,
    })),
  };
}

