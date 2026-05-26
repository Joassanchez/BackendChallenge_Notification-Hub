import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleCode } from "../src/generated/prisma/client.js";

process.env.DATABASE_URL ??= "postgresql://notification_user:notification_password@localhost:5432/notification_hub_db?schema=public";
process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";
process.env.DAILY_MESSAGE_LIMIT = "5";

const { createApp } = await import("../src/app.js");
const { prisma: appPrisma } = await import("../src/shared/database/prisma.js");

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
}

async function deleteRateLimitRouteTestUsers() {
  await prisma.user.deleteMany({
    where: {
      username: {
        startsWith: "rl_route_vitest_",
      },
    },
  });
}

function uniqueUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    username: `rl_route_vitest_${suffix}`,
    email: `rl_route_vitest_${suffix}@example.com`,
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

function currentUtcUsageDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatUsageDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe("Rate limit report API", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("requires authentication for GET /rate-limit/me", async () => {
    const response = await request(app).get("/rate-limit/me").expect(401);

    expect(response.body).toEqual({
      error: "UNAUTHORIZED",
      message: "Authentication is required",
    });
  });

  it("returns the authenticated user's current quota report", async () => {
    await ensureSeedData();
    await deleteRateLimitRouteTestUsers();

    const { user, token } = await createUserAndLogin();
    const usageDate = currentUtcUsageDate();

    await prisma.dailyUsage.create({
      data: {
        userId: user.id,
        usageDate,
        sentCount: 2,
        dailyLimit: 5,
      },
    });

    const response = await request(app).get("/rate-limit/me").set("Authorization", `Bearer ${token}`).expect(200);

    expect(response.body).toEqual({
      usageDate: formatUsageDate(usageDate),
      dailyLimit: 5,
      usedToday: 2,
      remainingToday: 3,
    });

    await deleteRateLimitRouteTestUsers();
  });
});
