import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../shared/config/env.js";
import { unauthorized } from "../../shared/http/errors.js";

export type AccessTokenPayload = {
  sub: string;
};

export class TokenService {
  signAccessToken(userId: string): string {
    const expiresIn = env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>;

    return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);

      if (typeof payload !== "object" || payload === null || typeof payload.sub !== "string") {
        throw unauthorized("Invalid authentication token");
      }

      return { sub: payload.sub };
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid authentication token") {
        throw error;
      }

      throw unauthorized("Invalid authentication token");
    }
  }
}
