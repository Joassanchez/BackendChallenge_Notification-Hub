import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

const { createApp } = await import("../src/app.js");

const app = createApp();

describe("OpenAPI documentation", () => {
  it("serves the OpenAPI document", async () => {
    const response = await request(app).get("/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info.title).toBe("Notification Hub API");
    expect(response.body.paths).toHaveProperty("/auth/login");
    expect(response.body.paths).toHaveProperty("/messages");
    expect(response.body.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("serves Swagger UI", async () => {
    const response = await request(app).get("/docs/").expect(200);

    expect(response.text).toContain("Swagger UI");
  });

  describe("auto-target-discovery endpoints", () => {
    let doc: Record<string, unknown>;

    beforeAll(async () => {
      const response = await request(app).get("/openapi.json").expect(200);
      doc = response.body as Record<string, unknown>;
    });

    it("has Webhooks tag", () => {
      const tags = doc.tags as Array<{ name: string }>;
      expect(tags).toEqual(
        expect.arrayContaining([{ name: "Webhooks" }]),
      );
    });

    it("has POST /notification-targets/connect-code", () => {
      const paths = doc.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/notification-targets/connect-code");
      const path = paths["/notification-targets/connect-code"] as Record<string, unknown>;
      expect(path).toHaveProperty("post");
      const post = path.post as Record<string, unknown>;
      expect(post.tags).toContain("Notification Targets");
      expect(post.security).toEqual([{ bearerAuth: [] }]);
      expect(post.requestBody).toBeDefined();
      expect((post.responses as Record<string, unknown>)["201"]).toBeDefined();
    });

    it("has POST /webhooks/telegram", () => {
      const paths = doc.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/webhooks/telegram");
      const path = paths["/webhooks/telegram"] as Record<string, unknown>;
      expect(path).toHaveProperty("post");
      const post = path.post as Record<string, unknown>;
      expect(post.tags).toContain("Webhooks");
      expect(post.security).toEqual([]);
      const params = post.parameters as Array<Record<string, unknown>>;
      expect(params).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "X-Telegram-Bot-Api-Secret-Token", in: "header", required: true }),
        ]),
      );
      expect((post.responses as Record<string, unknown>)["200"]).toBeDefined();
      expect((post.responses as Record<string, unknown>)["403"]).toBeDefined();
    });

    it("has POST /webhooks/discord", () => {
      const paths = doc.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/webhooks/discord");
      const path = paths["/webhooks/discord"] as Record<string, unknown>;
      expect(path).toHaveProperty("post");
      const post = path.post as Record<string, unknown>;
      expect(post.tags).toContain("Webhooks");
      expect(post.security).toEqual([]);
      const params = post.parameters as Array<Record<string, unknown>>;
      expect(params).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "X-Signature-Ed25519", in: "header", required: true }),
          expect.objectContaining({ name: "X-Signature-Timestamp", in: "header", required: true }),
        ]),
      );
      expect((post.responses as Record<string, unknown>)["200"]).toBeDefined();
      expect((post.responses as Record<string, unknown>)["401"]).toBeDefined();
    });

    it("has POST /providers/telegram/setup-webhook", () => {
      const paths = doc.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/providers/telegram/setup-webhook");
      const path = paths["/providers/telegram/setup-webhook"] as Record<string, unknown>;
      expect(path).toHaveProperty("post");
      const post = path.post as Record<string, unknown>;
      expect(post.tags).toContain("Providers");
      expect(post.security).toEqual([{ bearerAuth: [] }]);
      expect((post.responses as Record<string, unknown>)["200"]).toBeDefined();
      expect((post.responses as Record<string, unknown>)["502"]).toBeDefined();
    });

    it("has ConnectCodeRequest schema", () => {
      const schemas = (doc.components as Record<string, unknown>).schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("ConnectCodeRequest");
      const schema = schemas.ConnectCodeRequest as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.required).toContain("provider");
    });

    it("has ConnectCodeResponse schema", () => {
      const schemas = (doc.components as Record<string, unknown>).schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("ConnectCodeResponse");
      const schema = schemas.ConnectCodeResponse as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.required).toContain("code");
      expect(schema.required).toContain("expiresAt");
      expect(schema.required).toContain("connectUrl");
    });

    it("has TelegramUpdate schema", () => {
      const schemas = (doc.components as Record<string, unknown>).schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("TelegramUpdate");
    });

    it("has DiscordInteraction schema", () => {
      const schemas = (doc.components as Record<string, unknown>).schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("DiscordInteraction");
    });

    it("has TelegramSetupWebhookRequest schema", () => {
      const schemas = (doc.components as Record<string, unknown>).schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("TelegramSetupWebhookRequest");
      const schema = schemas.TelegramSetupWebhookRequest as Record<string, unknown>;
      expect(schema.required).toContain("url");
    });

    it("has Unauthorized, Forbidden, BadRequest response references", () => {
      const responses = (doc.components as Record<string, unknown>).responses as Record<string, unknown>;
      expect(responses).toHaveProperty("Unauthorized");
      expect(responses).toHaveProperty("Forbidden");
      expect(responses).toHaveProperty("BadRequest");
    });
  });
});
