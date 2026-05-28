import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { RateLimitService } from "./rate-limit.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createRateLimitRouter(rateLimitService: RateLimitService): Router {
  const router = createRouter();

  router.get(
    "/me",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const report = await rateLimitService.getReport(auth.id);

      response.status(200).json(report);
    }),
  );

  return router;
}

function requireAuth(request: Request) {
  if (request.auth === undefined) {
    throw unauthorized();
  }

  return request.auth;
}
