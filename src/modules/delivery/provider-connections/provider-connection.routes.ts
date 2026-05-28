import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { ProviderConnectionController } from "./provider-connection.controller.js";
import type { ProviderConnectionService } from "./provider-connection.service.js";

export function createAdminProviderConnectionRouter(providerConnectionService: ProviderConnectionService): Router {
  const router = createRouter();
  const controller = new ProviderConnectionController(providerConnectionService);

  router.get("/", asyncHandler(controller.listProviderConnectionsForAdmin));

  return router;
}
