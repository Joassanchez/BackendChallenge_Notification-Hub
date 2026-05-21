import { Prisma } from "../../generated/prisma/client.js";
import { conflict, unauthorized, unprocessable } from "../../shared/http/errors.js";
import { toSafeUserDto, type SafeUserDto } from "../users/user-mapper.js";
import type { UserRepository } from "../users/user-repository.js";
import type { PasswordService } from "./password.service.js";
import type { TokenService } from "./token.service.js";

export type RegisterInput = {
  username: string;
  email?: string;
  password: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

export type LoginResult = {
  accessToken: string;
  tokenType: "Bearer";
};

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput): Promise<SafeUserDto> {
    validateRegisterInput(input);

    const passwordHash = await this.passwords.hash(input.password);

    try {
      const email = normalizeOptionalEmail(input.email);
      const user = await this.users.createWithDefaultRole({
        username: input.username.trim(),
        ...(email === undefined ? {} : { email }),
        passwordHash,
      });

      return toSafeUserDto(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("Username or email already exists");
      }

      throw error;
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    validateLoginInput(input);

    const user = await this.users.findByIdentifierWithRoles(input.identifier.trim());

    if (user === null) {
      throw unauthorized("Invalid username/email or password");
    }

    const passwordMatches = await this.passwords.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw unauthorized("Invalid username/email or password");
    }

    await this.users.updateLastLoginAt(user.id, new Date());

    return {
      accessToken: this.tokens.signAccessToken(user.id),
      tokenType: "Bearer",
    };
  }
}

function validateRegisterInput(input: RegisterInput): void {
  const errors: string[] = [];

  if (input.username.trim().length === 0) {
    errors.push("username is required");
  }

  if (input.email !== undefined && input.email.trim().length > 0 && !input.email.includes("@")) {
    errors.push("email must be valid");
  }

  if (input.password.length === 0) {
    errors.push("password is required");
  }

  if (errors.length > 0) {
    throw unprocessable("Invalid registration payload", { errors });
  }
}

function validateLoginInput(input: LoginInput): void {
  const errors: string[] = [];

  if (input.identifier.trim().length === 0) {
    errors.push("username/email is required");
  }

  if (input.password.length === 0) {
    errors.push("password is required");
  }

  if (errors.length > 0) {
    throw unprocessable("Invalid login payload", { errors });
  }
}

function normalizeOptionalEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized === "" ? undefined : normalized;
}
