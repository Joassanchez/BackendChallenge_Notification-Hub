import type { Router } from "express";
import { Router as createRouter } from "express";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { MessageController } from "./message.controller.js";
import type { MessageService } from "./message.service.js";

export function createMessageRouter(messageService: MessageService): Router {
  const router = createRouter();
  const controller = new MessageController(messageService);

  router.post("/", asyncHandler(controller.create));
  router.get("/", asyncHandler(controller.list));
  router.get("/:id", asyncHandler(controller.getById));

  return router;
}
