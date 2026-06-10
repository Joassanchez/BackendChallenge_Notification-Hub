import { Router } from "express";
import type { ConnectCodeService } from "../connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../notifications/notification-targets/notification-target.service.js";
import type { ProviderConnectionRepository } from "../../delivery/provider-connections/provider-connection.repository.js";
import type { DeliveryConfigResolver } from "../../delivery/execution/delivery-config-resolver.js";
import { TelegramWebhookHandler } from "./telegram-webhook.handler.js";

export function createTelegramWebhookRouter(deps: {
  connectCodeService: ConnectCodeService;
  notificationTargetService: NotificationTargetService;
  providerConnectionRepository: ProviderConnectionRepository;
  deliveryConfigResolver: DeliveryConfigResolver;
  webhookSecret: string;
}): Router {
  const handler = new TelegramWebhookHandler(
    deps.connectCodeService,
    deps.notificationTargetService,
    deps.providerConnectionRepository,
    deps.deliveryConfigResolver,
    deps.webhookSecret,
  );

  const router = Router();

  router.post("/", async (req, res) => {
    const secret = req.headers["x-telegram-bot-api-secret-token"];

    if (secret !== deps.webhookSecret) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await handler.handle(req.body);
    res.status(result.status).json(result.body);
  });

  return router;
}
