import type { Request, Response } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { RateLimitService } from "./rate-limit.service.js";

export class RateLimitController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  readonly getMyReport = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const report = await this.rateLimitService.getReport(auth.id);

    response.status(200).json(report);
  };
}

function requireAuth(request: Request) {
  if (request.auth === undefined) {
    throw unauthorized();
  }

  return request.auth;
}
