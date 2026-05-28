import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { AdminReportingController } from "./admin-reporting.controller.js";
import type { AdminReportingService } from "./admin-reporting.service.js";

export function createAdminReportingRouter(adminReportingService: AdminReportingService): Router {
  const router = createRouter();
  const controller = new AdminReportingController(adminReportingService);

  router.get("/messages", asyncHandler(controller.listMessages));

  return router;
}
