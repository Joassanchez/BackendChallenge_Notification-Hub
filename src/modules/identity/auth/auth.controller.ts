import type { Request, Response } from "express";
import { validateBody } from "../../../shared/http/validation-wrapper.js";
import type { AuthService } from "./auth.service.js";
import { registerBodySchema, loginBodySchema } from "./auth.schemas.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  readonly register = async (request: Request, response: Response): Promise<void> => {
    const body = validateBody(registerBodySchema, request.body, {
      mode: "validation-error",
      message: "Invalid registration payload",
    });

    const user = await this.authService.register({
      username: body.username!,
      ...(body.email === undefined ? {} : { email: body.email }),
      password: body.password!,
    });

    response.status(201).json(user);
  };

  readonly login = async (request: Request, response: Response): Promise<void> => {
    const body = validateBody(loginBodySchema, request.body, {
      mode: "validation-error",
      message: "Invalid login payload",
    });

    const identifier = body.identifier ?? body.username ?? body.email;

    const result = await this.authService.login({
      identifier: identifier!,
      password: body.password!,
    });

    response.status(200).json(result);
  };
}
