import type { RequestHandler } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import { toSafeUserDto } from "../users/user-mapper.js";
import type { UserRepository } from "../users/user-repository.js";
import type { TokenService } from "./token.service.js";

export function createAuthenticateMiddleware(tokens: TokenService, users: UserRepository): RequestHandler {
  return async (request, _response, next) => {
    try {
      const header = request.header("authorization");

      if (header === undefined) {
        throw unauthorized();
      }

      const [scheme, token] = header.split(" ");

      if (scheme !== "Bearer" || token === undefined || token.trim() === "") {
        throw unauthorized("Invalid authorization header");
      }

      const payload = tokens.verifyAccessToken(token);
      const user = await users.findByIdWithRoles(payload.sub);

      if (user === null) {
        throw unauthorized("Invalid authentication token");
      }

      request.auth = toSafeUserDto(user);
      next();
    } catch (error) {
      next(error);
    }
  };
}
