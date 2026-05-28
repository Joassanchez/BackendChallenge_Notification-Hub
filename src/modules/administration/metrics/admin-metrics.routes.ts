import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { AdminMetricsController } from "./admin-metrics.controller.js";
import type { AdminMetricsService } from "./admin-metrics.service.js";

export function createAdminMetricsRouter(adminMetricsService: AdminMetricsService): Router {
  const router = createRouter();
  const controller = new AdminMetricsController(adminMetricsService);

  router.get("/metrics", asyncHandler(controller.getMetrics));

  return router;
}
