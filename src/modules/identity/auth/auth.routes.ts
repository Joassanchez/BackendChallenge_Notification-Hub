import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { badRequest } from "../../../shared/http/errors.js";
import type { AuthService } from "./auth.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createAuthRouter(authService: AuthService): Router {
  const router = createRouter();

  router.post(
    "/register",
    asyncHandler(async (request, response) => {
      const body = requireObjectBody(request.body);
      const email = readOptionalString(body, "email");
      const user = await authService.register({
        username: readString(body, "username"),
        ...(email === undefined ? {} : { email }),
        password: readString(body, "password"),
      });

      response.status(201).json(user);
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (request, response) => {
      const body = requireObjectBody(request.body);
      const identifier = readOptionalString(body, "identifier") ?? readOptionalString(body, "username") ?? readOptionalString(body, "email");

      if (identifier === undefined) {
        throw badRequest("username, email, or identifier is required");
      }

      const result = await authService.login({
        identifier,
        password: readString(body, "password"),
      });

      response.status(200).json(result);
    }),
  );

  return router;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object");
  }

  return body as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== "string") {
    throw badRequest(`${key} must be a string`);
  }

  return value;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw badRequest(`${key} must be a string`);
  }

  return value;
}
