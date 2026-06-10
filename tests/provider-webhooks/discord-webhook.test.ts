import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as cryptoSign, createPrivateKey } from "node:crypto";
import { DiscordWebhookHandler } from "../../src/modules/provider-webhooks/discord/discord-webhook.handler.js";
import type { ConnectCodeService } from "../../src/modules/provider-webhooks/connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../src/modules/notifications/notification-targets/notification-target.service.js";
import { AppError } from "../../src/shared/http/errors.js";

// Generate a test Ed25519 keypair
const { publicKey: spkiPublicKey, privateKey: pkcs8PrivateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});

// Extract raw 32-byte public key (last 32 bytes of SPKI DER)
const rawPublicKey = spkiPublicKey.slice(-32);
const publicKeyHex = rawPublicKey.toString("hex");

// Build a proper KeyObject for signing
const privateKeyObj = createPrivateKey({
  key: pkcs8PrivateKey,
  format: "der",
  type: "pkcs8",
});

function signPayload(timestamp: string, rawBody: Buffer): string {
  const data = Buffer.from(timestamp + rawBody.toString("utf-8"));
  const sig = cryptoSign(null, data, privateKeyObj);
  return sig.toString("hex");
}

const userId = "user-001";
const channelId = "987654321";

function buildHandler(overrides: {
  connectCodeService?: ConnectCodeService;
  notificationTargetService?: NotificationTargetService;
  publicKey?: string;
} = {}) {
  const connectCodeService = overrides.connectCodeService ?? {
    generate: vi.fn(),
    validate: vi.fn((_code: string) => ({ userId, provider: "discord" })),
  } as unknown as ConnectCodeService;

  const notificationTargetService = overrides.notificationTargetService ?? {
    autoCreate: vi.fn(async () => ({ id: "disc-target-1", provider: "discord", externalTargetId: channelId, targetType: "channel" })),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  } as unknown as NotificationTargetService;

  return {
    handler: new DiscordWebhookHandler(
      connectCodeService,
      notificationTargetService,
      overrides.publicKey ?? publicKeyHex,
    ),
    connectCodeService,
    notificationTargetService,
  };
}

function buildInteraction(overrides: Record<string, unknown> = {}): Buffer {
  const body = {
    type: 2,
    data: {
      name: "connect",
      options: [{ name: "code", value: "ABC123" }],
    },
    channel_id: channelId,
    token: "interaction-token-xyz",
    ...overrides,
  };
  return Buffer.from(JSON.stringify(body), "utf-8");
}

function makeHeaders(rawBody: Buffer, overrides: { signature?: string; timestamp?: string } = {}) {
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = overrides.signature ?? signPayload(timestamp, rawBody);
  return { signature, timestamp };
}

describe("DiscordWebhookHandler", () => {
  describe("verifySignature", () => {
    it("returns true for valid signature", () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf-8");
      const timestamp = "1234567890";
      const signature = signPayload(timestamp, rawBody);

      const result = handler.verifySignature(rawBody, signature, timestamp);
      expect(result).toBe(true);
    });

    it("returns false for tampered body", () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf-8");
      const timestamp = "1234567890";
      const signature = signPayload(timestamp, rawBody);
      const tamperedBody = Buffer.from(JSON.stringify({ type: 2 }), "utf-8");

      const result = handler.verifySignature(tamperedBody, signature, timestamp);
      expect(result).toBe(false);
    });

    it("returns false for wrong timestamp", () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf-8");
      const timestamp = "1234567890";
      const signature = signPayload(timestamp, rawBody);

      const result = handler.verifySignature(rawBody, signature, "9999999999");
      expect(result).toBe(false);
    });

    it("returns false for garbage signature", () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf-8");
      const result = handler.verifySignature(rawBody, "deadbeef", "1234567890");
      expect(result).toBe(false);
    });
  });

  describe("handle", () => {
    it("returns PONG for type 1 (PING) with valid signature", async () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf-8");
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ type: 1 });
    });

    it("returns 401 when signature header is missing", async () => {
      const { handler } = buildHandler();
      const rawBody = buildInteraction();

      const result = await handler.handle(rawBody, { signature: undefined, timestamp: "1234567890" });

      expect(result.status).toBe(401);
    });

    it("returns 401 when timestamp header is missing", async () => {
      const { handler } = buildHandler();
      const rawBody = buildInteraction();
      const { signature } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp: undefined });

      expect(result.status).toBe(401);
    });

    it("returns 401 for invalid signature", async () => {
      const { handler } = buildHandler();
      const rawBody = buildInteraction();

      const result = await handler.handle(rawBody, { signature: "bad-sig", timestamp: "1234567890" });

      expect(result.status).toBe(401);
    });

    it("returns 400 for invalid JSON body", async () => {
      const { handler } = buildHandler();
      const rawBody = Buffer.from("not-json", "utf-8");
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(result.status).toBe(400);
    });

    it("returns 400 for unknown command", async () => {
      const { handler } = buildHandler();
      const rawBody = buildInteraction({ data: { name: "unknown", options: [] } });
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(result.status).toBe(400);
    });

    it("handles /connect CODE and calls autoCreate", async () => {
      const { handler, connectCodeService, notificationTargetService } = buildHandler();
      const rawBody = buildInteraction();
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(connectCodeService.validate).toHaveBeenCalledWith("ABC123");
      expect(notificationTargetService.autoCreate).toHaveBeenCalledWith({
        userId,
        providerCode: "discord",
        externalTargetId: channelId,
        targetType: "channel",
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        type: 4,
        data: {
          content: "✅ Connected! You\'ll receive notifications in this channel.",
          flags: 64,
        },
      });
    });

    it("returns ephemeral error for expired code", async () => {
      const { handler, connectCodeService } = buildHandler({
        connectCodeService: {
          generate: vi.fn(),
          validate: vi.fn(() => {
            throw new AppError(400, "BAD_REQUEST", "code expired");
          }),
        } as unknown as ConnectCodeService,
      });
      const rawBody = buildInteraction();
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        type: 4,
        data: {
          content: "Error: code expired",
          flags: 64,
        },
      });
    });

    it("returns ephemeral error for invalid code", async () => {
      const { handler, connectCodeService } = buildHandler({
        connectCodeService: {
          generate: vi.fn(),
          validate: vi.fn(() => {
            throw new AppError(400, "BAD_REQUEST", "invalid code");
          }),
        } as unknown as ConnectCodeService,
      });
      const rawBody = buildInteraction();
      const { signature, timestamp } = makeHeaders(rawBody);

      const result = await handler.handle(rawBody, { signature, timestamp });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        type: 4,
        data: {
          content: "Error: invalid code",
          flags: 64,
        },
      });
    });
  });
});
