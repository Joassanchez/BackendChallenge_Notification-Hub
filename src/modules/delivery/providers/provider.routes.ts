import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { ProviderController } from "./provider.controller.js";
import type { ProviderService } from "./provider.service.js";

export function createProviderRouter(providerService: ProviderService): Router {
  const router = createRouter();
  const controller = new ProviderController(providerService);

  router.get("/", asyncHandler(controller.listActiveProviders));

  return router;
}
