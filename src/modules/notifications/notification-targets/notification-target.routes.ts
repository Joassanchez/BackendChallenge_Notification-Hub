import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import type { ConnectCodeService } from "../../provider-webhooks/connect-code/connect-code.service.js";
import { NotificationTargetController } from "./notification-target.controller.js";
import type { NotificationTargetService } from "./notification-target.service.js";

export function createNotificationTargetRouter(
  notificationTargetService: NotificationTargetService,
  connectCodeService?: ConnectCodeService,
): Router {
  const router = createRouter();
  const controller = new NotificationTargetController(notificationTargetService, connectCodeService);

  router.get("/", asyncHandler(controller.list));
  router.post("/", asyncHandler(controller.create));

  if (connectCodeService) {
    router.post("/connect-code", asyncHandler(controller.connectCode));
  }

  router.patch("/:id", asyncHandler(controller.update));
  router.patch("/:id/activate", asyncHandler(controller.activate));
  router.patch("/:id/deactivate", asyncHandler(controller.deactivate));

  return router;
}
