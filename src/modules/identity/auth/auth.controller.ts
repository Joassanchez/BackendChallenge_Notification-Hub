import type { Request, Response } from "express";
import { badRequest } from "../../../shared/http/errors.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  readonly register = async (request: Request, response: Response): Promise<void> => {
    const body = requireObjectBody(request.body);
    const email = readOptionalString(body, "email");
    const user = await this.authService.register({
      username: readString(body, "username"),
      ...(email === undefined ? {} : { email }),
      password: readString(body, "password"),
    });

    response.status(201).json(user);
  };

  readonly login = async (request: Request, response: Response): Promise<void> => {
    const body = requireObjectBody(request.body);
    const identifier = readOptionalString(body, "identifier") ?? readOptionalString(body, "username") ?? readOptionalString(body, "email");

    if (identifier === undefined) {
      throw badRequest("username, email, or identifier is required");
    }

    const result = await this.authService.login({
      identifier,
      password: readString(body, "password"),
    });

    response.status(200).json(result);
  };
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
