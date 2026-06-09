import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { AuthService } from "../../src/modules/identity/auth/auth.service.js";
import type { PasswordService } from "../../src/modules/identity/auth/password.service.js";
import type { TokenService } from "../../src/modules/identity/auth/token.service.js";
import type { UserRepository } from "../../src/modules/identity/users/user-repository.js";
import type { UserWithRoles } from "../../src/modules/identity/users/user-mapper.js";
import { buildUserWithRoles, expectAppError, userId } from "../helpers/service-fixtures.js";

type CreateUserInput = Parameters<UserRepository["createWithDefaultRole"]>[0];

function createService(input: {
  user?: UserWithRoles | null;
  createUser?: (payload: CreateUserInput) => Promise<UserWithRoles>;
  passwordMatches?: boolean;
  token?: string;
} = {}) {
  const user = input.user === undefined ? buildUserWithRoles() : input.user;
  const createdUser = input.user === null ? buildUserWithRoles() : (input.user ?? buildUserWithRoles());
  const users = {
    createWithDefaultRole: vi.fn(input.createUser ?? (async () => createdUser)),
    findByIdentifierWithRoles: vi.fn(async () => user),
    updateLastLoginAt: vi.fn(async () => createdUser),
  };
  const passwords = {
    hash: vi.fn(async () => "hashed-password"),
    compare: vi.fn(async () => input.passwordMatches ?? true),
  } satisfies PasswordService;
  const tokens = {
    signAccessToken: vi.fn(() => input.token ?? "signed-access-token"),
    verifyAccessToken: vi.fn(),
  } satisfies TokenService;

  return {
    service: new AuthService(users as unknown as UserRepository, passwords, tokens),
    users,
    passwords,
    tokens,
  };
}

describe("AuthService", () => {
  it("normalizes registration data and returns a safe user DTO", async () => {
    const persistedUser = buildUserWithRoles({
      username: "alice",
      email: "alice@example.com",
      passwordHash: "stored-hash",
    });
    const { service, users, passwords } = createService({ user: persistedUser });

    const result = await service.register({
      username: " alice ",
      email: " ALICE@EXAMPLE.COM ",
      password: "Password123!",
    });

    expect(passwords.hash).toHaveBeenCalledWith("Password123!");
    expect(users.createWithDefaultRole).toHaveBeenCalledWith({
      username: "alice",
      email: "alice@example.com",
      passwordHash: "hashed-password",
    });
    expect(result).toEqual({
      id: persistedUser.id,
      username: "alice",
      email: "alice@example.com",
      roles: ["USER"],
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("maps duplicate username or email persistence errors to conflict semantics", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    const { service } = createService({
      createUser: async () => {
        throw duplicate;
      },
    });

    await expectAppError(
      () => service.register({ username: "alice", email: "alice@example.com", password: "Password123!" }),
      { statusCode: 409, code: "CONFLICT", message: "Username or email already exists" },
    );
  });

  it("rejects unknown users and invalid passwords with the same unauthorized response", async () => {
    const missingUser = createService({ user: null });
    await expectAppError(
      () => missingUser.service.login({ identifier: "alice", password: "Password123!" }),
      { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid username/email or password" },
    );

    const wrongPassword = createService({ passwordMatches: false });
    await expectAppError(
      () => wrongPassword.service.login({ identifier: "alice", password: "wrong" }),
      { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid username/email or password" },
    );
    expect(wrongPassword.users.updateLastLoginAt).not.toHaveBeenCalled();
    expect(wrongPassword.tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it("logs in with trimmed identifiers, updates last login, and returns bearer token output", async () => {
    const user = buildUserWithRoles({ id: userId, passwordHash: "stored-hash" });
    const { service, users, passwords, tokens } = createService({
      user,
      token: "access-token-for-user",
    });

    const result = await service.login({ identifier: " vitest_user ", password: "Password123!" });

    expect(users.findByIdentifierWithRoles).toHaveBeenCalledWith("vitest_user");
    expect(passwords.compare).toHaveBeenCalledWith("Password123!", "stored-hash");
    expect(users.updateLastLoginAt).toHaveBeenCalledWith(userId, expect.any(Date));
    expect(tokens.signAccessToken).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ accessToken: "access-token-for-user", tokenType: "Bearer" });
  });
});
