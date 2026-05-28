import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { RateLimitController } from "./rate-limit.controller.js";
import type { RateLimitService } from "./rate-limit.service.js";

export function createRateLimitRouter(rateLimitService: RateLimitService): Router {
  const router = createRouter();
  const controller = new RateLimitController(rateLimitService);

  router.get("/me", asyncHandler(controller.getMyReport));

  return router;
}
