import { Router } from "express";
import { z } from "zod";
import type { ProviderConnectionRepository } from "../../delivery/provider-connections/provider-connection.repository.js";
import type { DeliveryConfigResolver } from "../../delivery/execution/delivery-config-resolver.js";
import { asyncHandler } from "../../../shared/http/async-handler.js";
import { badRequest } from "../../../shared/http/errors.js";
import { validateBody } from "../../../shared/http/validation-wrapper.js";

const setupWebhookBodySchema = z.object({
  url: z.string().url(),
});

export function createTelegramSetupRouter(deps: {
  providerConnectionRepository: ProviderConnectionRepository;
  deliveryConfigResolver: DeliveryConfigResolver;
}): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const { url } = validateBody(setupWebhookBodySchema, request.body, {
        mode: "bad-request",
      });

      // Find active Telegram bot-token connections
      const connections = await deps.providerConnectionRepository.findProviderConnectionsForAdmin();
      const telegramBotConnections = connections.filter(
        (c) =>
          c.provider.code === "telegram" &&
          c.authType === "bot-token" &&
          c.isActive,
      );

      if (telegramBotConnections.length === 0) {
        throw badRequest("No active Telegram bot-token connection found");
      }

      // Resolve the bot token from the first matching connection
      const connection = telegramBotConnections[0]!;
      const config = deps.deliveryConfigResolver.resolve(connection);

      if (!config.ok) {
        throw badRequest(config.errorMessage);
      }

      // Call Telegram setWebhook API
      const telegramUrl = `https://api.telegram.org/bot${config.resolvedSecret}/setWebhook`;
      const tgResponse = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        }),
      });

      const result = (await tgResponse.json()) as Record<string, unknown>;

      response.status(tgResponse.ok ? 200 : 502).json(result);
    }),
  );

  return router;
}
