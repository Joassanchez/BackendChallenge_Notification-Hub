import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { NotificationTargetController } from "./notification-target.controller.js";
import type { NotificationTargetService } from "./notification-target.service.js";

export function createNotificationTargetRouter(notificationTargetService: NotificationTargetService): Router {
  const router = createRouter();
  const controller = new NotificationTargetController(notificationTargetService);

  router.get("/", asyncHandler(controller.list));
  router.post("/", asyncHandler(controller.create));
  router.patch("/:id", asyncHandler(controller.update));
  router.patch("/:id/activate", asyncHandler(controller.activate));
  router.patch("/:id/deactivate", asyncHandler(controller.deactivate));

  return router;
}
