import { describe, expect, it } from "vitest";
import { MessageStatus, ProviderCode } from "../../src/generated/prisma/client.js";
import {
  createMessageBodySchema,
  listMessagesQuerySchema,
  messageIdParamsSchema,
  idempotencyKeyHeaderSchema,
} from "../../src/modules/notifications/messages/message.schemas.js";

// --- createMessageBodySchema ---

describe("createMessageBodySchema", () => {
  it("accepts valid create payload", () => {
    const body = {
      content: "Hello",
      destinations: [{ provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" }],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("accepts multiple destinations", () => {
    const body = {
      content: "Hello team",
      destinations: [
        { provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" },
        { provider: ProviderCode.discord, targetId: "44444444-4444-4444-8444-444444444444" },
      ],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const body = {
      content: "   ",
      destinations: [{ provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" }],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("content must not be empty");
    }
  });

  it("rejects non-string content", () => {
    const body = {
      content: 123,
      destinations: [{ provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" }],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("content must be a string");
    }
  });

  it("rejects empty destinations array", () => {
    const body = {
      content: "Hello",
      destinations: [],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("destinations must be a non-empty array");
    }
  });

  it("rejects invalid provider in destination", () => {
    const body = {
      content: "Hello",
      destinations: [{ provider: "unknown", targetId: "33333333-3333-4333-8333-333333333333" }],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("destinations[0].provider must be a valid provider code");
    }
  });

  it("rejects invalid UUID in destination", () => {
    const body = {
      content: "Hello",
      destinations: [{ provider: ProviderCode.telegram, targetId: "not-a-uuid" }],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("destinations[0].targetId must be a valid UUID");
    }
  });

  it("rejects duplicate destinations", () => {
    const body = {
      content: "Hello",
      destinations: [
        { provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" },
        { provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" },
      ],
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("destinations must not contain duplicates");
    }
  });

  it("rejects unknown fields (strict mode)", () => {
    const body = {
      content: "Hello",
      destinations: [{ provider: ProviderCode.telegram, targetId: "33333333-3333-4333-8333-333333333333" }],
      unknownField: "should not be here",
    };
    const result = createMessageBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Unrecognized key"))).toBe(true);
    }
  });
});

// --- listMessagesQuerySchema ---

describe("listMessagesQuerySchema", () => {
  it("accepts empty query", () => {
    const result = listMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid status filter", () => {
    const result = listMessagesQuerySchema.safeParse({ status: MessageStatus.pending });
    expect(result.success).toBe(true);
  });

  it("accepts valid provider filter", () => {
    const result = listMessagesQuerySchema.safeParse({ provider: ProviderCode.telegram });
    expect(result.success).toBe(true);
  });

  it("accepts valid date filters", () => {
    const result = listMessagesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all filters together", () => {
    const result = listMessagesQuerySchema.safeParse({
      status: MessageStatus.success,
      provider: ProviderCode.discord,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = listMessagesQuerySchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("status must be a valid message status");
    }
  });

  it("rejects invalid provider", () => {
    const result = listMessagesQuerySchema.safeParse({ provider: "unknown" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("provider must be a valid provider code");
    }
  });

  it("rejects invalid date", () => {
    const result = listMessagesQuerySchema.safeParse({ from: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("from must be a valid date");
    }
  });

  it("rejects from after to", () => {
    const result = listMessagesQuerySchema.safeParse({
      from: "2026-01-02T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("from must be before or equal to to");
    }
  });

  it("accepts from equal to to", () => {
    const result = listMessagesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown query parameters", () => {
    const result = listMessagesQuerySchema.safeParse({ unknown: "value" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Unsupported query parameter: unknown");
    }
  });
});

// --- messageIdParamsSchema ---

describe("messageIdParamsSchema", () => {
  it("accepts a valid RFC v1-5 UUID", () => {
    const params = { id: "22222222-2222-4222-8222-222222222222" };
    const result = messageIdParamsSchema.safeParse(params);
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    const params = { id: "not-a-uuid" };
    const result = messageIdParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("message id must be a valid UUID");
    }
  });

  it("rejects missing id", () => {
    const result = messageIdParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// --- idempotencyKeyHeaderSchema ---

describe("idempotencyKeyHeaderSchema", () => {
  it("accepts empty headers (no idempotency key)", () => {
    const result = idempotencyKeyHeaderSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid idempotency key", () => {
    const result = idempotencyKeyHeaderSchema.safeParse({ "idempotency-key": "key-123" });
    expect(result.success).toBe(true);
  });

  it("accepts extra headers (passthrough)", () => {
    const result = idempotencyKeyHeaderSchema.safeParse({
      "idempotency-key": "key-1",
      "content-type": "application/json",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty idempotency key", () => {
    const result = idempotencyKeyHeaderSchema.safeParse({ "idempotency-key": "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Idempotency-Key must not be empty");
    }
  });
});
