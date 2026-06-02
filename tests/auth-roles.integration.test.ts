import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { cleanTransactionalData } from "./helpers/db-cleanup.js";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

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
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.telegram },
    update: {},
    create: { code: ProviderCode.telegram, name: "Telegram" },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.discord },
    update: {},
    create: { code: ProviderCode.discord, name: "Discord" },
  });
}

function uniqueUser() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    username: `vitest_${suffix}`,
    email: `vitest_${suffix}@example.com`,
    password: "Password123!",
  };
}

describe("Auth and roles API", () => {
  beforeAll(async () => {
    await cleanTransactionalData(prisma);
    await ensureSeedData();
  });

  afterAll(async () => {
    await cleanTransactionalData(prisma);
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  it("responds to health checks", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });

  it("registers a user with USER role and never exposes passwordHash", async () => {
    const user = uniqueUser();

    const response = await request(app).post("/auth/register").send(user).expect(201);

    expect(response.body).toMatchObject({
      username: user.username,
      email: user.email,
      roles: ["USER"],
    });
    expect(response.body).not.toHaveProperty("passwordHash");

    const persistedUser = await prisma.user.findUnique({
      where: { username: user.username },
      include: { roles: { include: { role: true } } },
    });

    expect(persistedUser?.passwordHash).not.toBe(user.password);
    expect(persistedUser?.roles.map((userRole) => userRole.role.code)).toContain(RoleCode.USER);
  });

  it("rejects duplicate username or email with conflict semantics", async () => {
    const user = uniqueUser();

    await request(app).post("/auth/register").send(user).expect(201);

    const response = await request(app).post("/auth/register").send(user).expect(409);

    expect(response.body).toMatchObject({
      error: "CONFLICT",
      message: "Username or email already exists",
    });
  });

  it("logs in by username and by email with Bearer tokens", async () => {
    const user = uniqueUser();
    await request(app).post("/auth/register").send(user).expect(201);

    const usernameLogin = await request(app)
      .post("/auth/login")
      .send({ username: user.username, password: user.password })
      .expect(200);

    const emailLogin = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(usernameLogin.body).toMatchObject({ tokenType: "Bearer" });
    expect(usernameLogin.body.accessToken).toEqual(expect.any(String));
    expect(emailLogin.body).toMatchObject({ tokenType: "Bearer" });
    expect(emailLogin.body.accessToken).toEqual(expect.any(String));

    const persistedUser = await prisma.user.findUnique({ where: { username: user.username } });
    expect(persistedUser?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("rejects invalid credentials with a generic unauthorized message", async () => {
    const user = uniqueUser();
    await request(app).post("/auth/register").send(user).expect(201);

    const response = await request(app)
      .post("/auth/login")
      .send({ username: user.username, password: "wrong-password" })
      .expect(401);

    expect(response.body).toMatchObject({
      error: "UNAUTHORIZED",
      message: "Invalid username/email or password",
    });
  });

  it("returns authenticated identity and roles from /me", async () => {
    const user = uniqueUser();
    await request(app).post("/auth/register").send(user).expect(201);
    const login = await request(app).post("/auth/login").send({ username: user.username, password: user.password }).expect(200);

    const response = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      username: user.username,
      email: user.email,
      roles: ["USER"],
    });
    expect(response.body).not.toHaveProperty("passwordHash");
  });

  it("rejects missing, malformed, and unverifiable tokens with 401", async () => {
    await request(app).get("/me").expect(401);

    await request(app).get("/me").set("Authorization", "Bearer bad.token.value").expect(401);

    await request(app).get("/me").set("Authorization", "NotBearer token").expect(401);
  });

  it("allows admins and forbids non-admin users on admin-only routes", async () => {
    const user = uniqueUser();
    await request(app).post("/auth/register").send(user).expect(201);

    const userLogin = await request(app).post("/auth/login").send({ username: user.username, password: user.password }).expect(200);

    await request(app)
      .get("/admin/auth-check")
      .set("Authorization", `Bearer ${userLogin.body.accessToken}`)
      .expect(403);

    await request(app).get("/admin/auth-check").expect(401);

    const adminLogin = await request(app).post("/auth/login").send({ username: "admin", password: "Admin123!" }).expect(200);

    const adminResponse = await request(app)
      .get("/admin/auth-check")
      .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
      .expect(200);

    expect(adminResponse.body).toEqual({ status: "authorized" });
  });
});
