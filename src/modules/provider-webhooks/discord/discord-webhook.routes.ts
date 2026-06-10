import { Router } from "express";
import type { ConnectCodeService } from "../connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../notifications/notification-targets/notification-target.service.js";
import { DiscordWebhookHandler } from "./discord-webhook.handler.js";

export function createDiscordWebhookRouter(deps: {
  connectCodeService: ConnectCodeService;
  notificationTargetService: NotificationTargetService;
  publicKey: string;
}): Router {
  const handler = new DiscordWebhookHandler(
    deps.connectCodeService,
    deps.notificationTargetService,
    deps.publicKey,
  );

  const router = Router();

  // Discord webhooks require raw body for signature verification.
  // express.raw() middleware must be applied BEFORE this router in app.ts.
  router.post("/", async (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.headers["x-signature-ed25519"] as string | undefined;
    const timestamp = req.headers["x-signature-timestamp"] as string | undefined;

    const result = await handler.handle(rawBody, { signature, timestamp });
    res.status(result.status).json(result.body);
  });

  return router;
}
