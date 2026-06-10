import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelegramSetupRouter } from "../../src/modules/provider-webhooks/telegram/telegram-setup.routes.js";
import type { ProviderConnectionRepository, ProviderConnectionWithProvider } from "../../src/modules/delivery/provider-connections/provider-connection.repository.js";
import { DeliveryConfigResolver } from "../../src/modules/delivery/execution/delivery-config-resolver.js";

function createTestApp(
  overrides: {
    providerConnectionRepository?: Partial<ProviderConnectionRepository>;
  } = {},
) {
  const app = express();
  app.use(express.json());

  const mockRepo = {
    findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([]),
    ...overrides.providerConnectionRepository,
  } as unknown as ProviderConnectionRepository;

  const router = createTelegramSetupRouter({
    providerConnectionRepository: mockRepo,
    deliveryConfigResolver: new DeliveryConfigResolver(),
  });

  app.use("/setup-webhook", router);

  return { app, mockRepo };
}

function makeFakeFetch(response: { ok: boolean; body: Record<string, unknown> }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    json: vi.fn().mockResolvedValue(response.body),
  });
}

function mockBotTokenConnection(): ProviderConnectionWithProvider {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  return {
    id: "conn-001",
    providerId: "prov-telegram",
    name: "Test Bot",
    authType: "bot-token",
    secretRef: "TELEGRAM_BOT_TOKEN",
    config: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    provider: {
      id: "prov-telegram",
      code: "telegram" as never,
      name: "Telegram",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe("Telegram setup-webhook route", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret-123";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it("calls Telegram setWebhook API and returns the result on success", async () => {
    const fakeFetch = makeFakeFetch({
      ok: true,
      body: { ok: true, result: true, description: "Webhook was set" },
    });
    vi.stubGlobal("fetch", fakeFetch);

    const connection = mockBotTokenConnection();
    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([connection]),
      },
    });

    const response = await request(app)
      .post("/setup-webhook")
      .send({ url: "https://myapp.example.com/webhooks/telegram" })
      .expect(200);

    expect(response.body).toEqual({ ok: true, result: true, description: "Webhook was set" });

    expect(fakeFetch).toHaveBeenCalledOnce();
    const fetchUrl = fakeFetch.mock.calls[0]![0] as string;
    expect(fetchUrl).toBe("https://api.telegram.org/bottest-bot-token/setWebhook");

    const fetchInit = fakeFetch.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(fetchInit.body as string);
    expect(body).toEqual({
      url: "https://myapp.example.com/webhooks/telegram",
      secret_token: "webhook-secret-123",
    });
  });

  it("returns 400 when url is missing from body", async () => {
    const connection = mockBotTokenConnection();
    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([connection]),
      },
    });

    await request(app)
      .post("/setup-webhook")
      .send({})
      .expect(400);
  });

  it("returns 400 when url is not a valid URL", async () => {
    const connection = mockBotTokenConnection();
    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([connection]),
      },
    });

    await request(app)
      .post("/setup-webhook")
      .send({ url: "not-a-url" })
      .expect(400);
  });

  it("returns 400 when no active Telegram bot-token connection exists", async () => {
    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([]),
      },
    });

    await request(app)
      .post("/setup-webhook")
      .send({ url: "https://myapp.example.com/webhooks/telegram" })
      .expect(400);
  });

  it("returns 502 when Telegram API responds with non-ok status", async () => {
    const fakeFetch = makeFakeFetch({
      ok: false,
      body: { ok: false, description: "Bad Request: wrong webhook URL format" },
    });
    vi.stubGlobal("fetch", fakeFetch);

    const connection = mockBotTokenConnection();
    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([connection]),
      },
    });

    const response = await request(app)
      .post("/setup-webhook")
      .send({ url: "https://myapp.example.com/webhooks/telegram" })
      .expect(502);

    expect(response.body.ok).toBe(false);
  });

  it("returns 400 when resolved secret is missing", async () => {
    const connection = mockBotTokenConnection();
    // Delete env var AFTER creating the mock connection object
    delete process.env.TELEGRAM_BOT_TOKEN;

    const { app } = createTestApp({
      providerConnectionRepository: {
        findProviderConnectionsForAdmin: vi.fn().mockResolvedValue([connection]),
      },
    });

    await request(app)
      .post("/setup-webhook")
      .send({ url: "https://myapp.example.com/webhooks/telegram" })
      .expect(400);
  });
});
