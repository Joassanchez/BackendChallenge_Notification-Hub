import { describe, expect, it, vi } from "vitest";
import { TelegramWebhookHandler } from "../../src/modules/provider-webhooks/telegram/telegram-webhook.handler.js";
import type { ConnectCodeService } from "../../src/modules/provider-webhooks/connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../src/modules/notifications/notification-targets/notification-target.service.js";
import type { ProviderConnectionRepository } from "../../src/modules/delivery/provider-connections/provider-connection.repository.js";
import type { DeliveryConfigResolver } from "../../src/modules/delivery/execution/delivery-config-resolver.js";
import { AppError } from "../../src/shared/http/errors.js";

const userId = "user-001";
const chatId = 123456789;
const webhookSecret = "test-secret-token";

function buildHandler(overrides: {
  connectCodeService?: ConnectCodeService;
  notificationTargetService?: NotificationTargetService;
} = {}) {
  const connectCodeService = overrides.connectCodeService ?? {
    generate: vi.fn(),
    validate: vi.fn((_code: string) => ({ userId, provider: "telegram" })),
  } as unknown as ConnectCodeService;

  const notificationTargetService = overrides.notificationTargetService ?? {
    autoCreate: vi.fn(async () => ({ id: "tg-target-1", provider: "telegram", externalTargetId: String(chatId), targetType: "chat" })),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  } as unknown as NotificationTargetService;

  const providerConnectionRepository = {} as ProviderConnectionRepository;
  const deliveryConfigResolver = {} as DeliveryConfigResolver;

  return {
    handler: new TelegramWebhookHandler(
      connectCodeService,
      notificationTargetService,
      providerConnectionRepository,
      deliveryConfigResolver,
      webhookSecret,
    ),
    connectCodeService,
    notificationTargetService,
  };
}

function buildUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: "private" },
      text: "/start ABC123",
      ...overrides.message as Record<string, unknown> ?? {},
    },
    ...overrides,
  };
}

describe("TelegramWebhookHandler", () => {
  describe("handle", () => {
    it("parses /start CODE and calls autoCreate", async () => {
      const { handler, connectCodeService, notificationTargetService } = buildHandler();
      const body = buildUpdate({ message: { message_id: 1, chat: { id: chatId }, text: "/start ABC123" } });

      const result = await handler.handle(body);

      expect(connectCodeService.validate).toHaveBeenCalledWith("ABC123");
      expect(notificationTargetService.autoCreate).toHaveBeenCalledWith({
        userId,
        providerCode: "telegram",
        externalTargetId: String(chatId),
        targetType: "chat",
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        method: "sendMessage",
        chat_id: chatId,
        text: "✅ Connected! You'll receive notifications in this chat.",
      });
    });

    it("returns 400 for invalid JSON body", async () => {
      const { handler } = buildHandler();
      const result = await handler.handle("not-json");

      expect(result.status).toBe(400);
    });

    it("returns 200 with help text for non-/start message", async () => {
      const { handler } = buildHandler();
      const body = buildUpdate({ message: { message_id: 1, chat: { id: chatId }, text: "hello bot" } });

      const result = await handler.handle(body);

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        method: "sendMessage",
        chat_id: chatId,
        text: "Send /start followed by your connect code to link this chat.",
      });
    });

    it("returns 200 silent ignore when no message field", async () => {
      const { handler } = buildHandler();
      const result = await handler.handle({ update_id: 1 });

      expect(result.status).toBe(200);
    });

    it("returns 200 silent ignore when message has no text", async () => {
      const { handler } = buildHandler();
      const body = buildUpdate();
      // Remove text from message
      body.message = { message_id: 1, chat: { id: chatId, type: "private" } } as typeof body.message;

      const result = await handler.handle(body);

      expect(result.status).toBe(200);
    });

    it("returns 200 with error for expired code", async () => {
      const { handler, connectCodeService } = buildHandler({
        connectCodeService: {
          generate: vi.fn(),
          validate: vi.fn(() => {
            throw new AppError(400, "BAD_REQUEST", "code expired");
          }),
        } as unknown as ConnectCodeService,
      });
      const body = buildUpdate({ message: { message_id: 1, chat: { id: chatId }, text: "/start EXPIRED" } });

      const result = await handler.handle(body);

      expect(result.status).toBe(200);
      expect(connectCodeService.validate).toHaveBeenCalledWith("EXPIRED");
      expect(result.body).toEqual({
        method: "sendMessage",
        chat_id: chatId,
        text: "Error: code expired",
      });
    });

    it("returns 200 with error for invalid code", async () => {
      const { handler, connectCodeService } = buildHandler({
        connectCodeService: {
          generate: vi.fn(),
          validate: vi.fn(() => {
            throw new AppError(400, "BAD_REQUEST", "invalid code");
          }),
        } as unknown as ConnectCodeService,
      });
      const body = buildUpdate({ message: { message_id: 1, chat: { id: chatId }, text: "/start BADCODE" } });

      const result = await handler.handle(body);

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        method: "sendMessage",
        chat_id: chatId,
        text: "Error: invalid code",
      });
    });
  });
});
