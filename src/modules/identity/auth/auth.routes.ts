import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = createRouter();
  const controller = new AuthController(authService);

  router.post("/register", asyncHandler(controller.register));
  router.post("/login", asyncHandler(controller.login));

  return router;
}
