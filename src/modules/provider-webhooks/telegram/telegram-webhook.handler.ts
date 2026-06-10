import { AppError } from "../../../shared/http/errors.js";
import type { ConnectCodeService } from "../connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../notifications/notification-targets/notification-target.service.js";
import type { ProviderConnectionRepository } from "../../delivery/provider-connections/provider-connection.repository.js";
import type { DeliveryConfigResolver } from "../../delivery/execution/delivery-config-resolver.js";
import { telegramUpdateSchema } from "./telegram-webhook.schemas.js";

export class TelegramWebhookHandler {
  constructor(
    private readonly connectCodeService: ConnectCodeService,
    private readonly notificationTargetService: NotificationTargetService,
    private readonly providerConnectionRepository: ProviderConnectionRepository,
    private readonly deliveryConfigResolver: DeliveryConfigResolver,
    private readonly webhookSecret: string,
  ) {}

  async handle(rawBody: unknown): Promise<{ status: number; body: unknown }> {
    const parsed = telegramUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return { status: 400, body: { error: "Invalid body" } };
    }

    const { message } = parsed.data;

    if (message === undefined || message.text === undefined) {
      return { status: 200, body: {} };
    }

    const chatId = message.chat.id;
    const text = message.text;

    const startMatch = text.match(/^\/start\s+(\S+)$/);

    if (startMatch === null) {
      return {
        status: 200,
        body: {
          method: "sendMessage",
          chat_id: chatId,
          text: "Send /start followed by your connect code to link this chat.",
        },
      };
    }

    const code = startMatch[1]!;

    try {
      const { userId } = this.connectCodeService.validate(code);

      await this.notificationTargetService.autoCreate({
        userId,
        providerCode: "telegram",
        externalTargetId: chatId.toString(),
        targetType: "chat",
      });

      return {
        status: 200,
        body: {
          method: "sendMessage",
          chat_id: chatId,
          text: "✅ Connected! You'll receive notifications in this chat.",
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        return {
          status: 200,
          body: {
            method: "sendMessage",
            chat_id: chatId,
            text: `Error: ${error.message}`,
          },
        };
      }

      throw error;
    }
  }
}
