import { describe, expect, it } from "vitest";
import { ProviderCode } from "../src/generated/prisma/client.js";
import {
  createTargetBodySchema,
  updateTargetBodySchema,
  targetIdParamsSchema,
} from "../src/modules/notifications/notification-targets/notification-target.schemas.js";

// --- createTargetBodySchema ---

describe("createTargetBodySchema", () => {
  it("accepts a valid create payload with all required fields", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "chat-123",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(body);
    }
  });

  it("accepts a valid create payload with optional displayName and metadata", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "chat-123",
      displayName: "My Chat",
      metadata: { chatId: "abc" },
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("allows null displayName and null metadata", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "chat-123",
      displayName: null,
      metadata: null,
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("rejects empty externalTargetId", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "   ",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("externalTargetId must not be empty");
    }
  });

  it("rejects empty targetType", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "",
      externalTargetId: "chat-123",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("targetType must not be empty");
    }
  });

  it("rejects invalid provider code", () => {
    const body = {
      provider: "unknown",
      targetType: "chat",
      externalTargetId: "chat-123",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("provider must be a valid provider code");
    }
  });

  it("rejects providerConnectionId field", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "chat-123",
      providerConnectionId: "some-connection-id",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("providerConnectionId is not accepted");
    }
  });

  it("rejects unsupported provider ↔ targetType combination", () => {
    const body = {
      provider: ProviderCode.discord,
      targetType: "chat",
      externalTargetId: "chat-123",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("provider target type is not supported");
    }
  });

  it("accepts extra unknown fields (ignored by service)", () => {
    const body = {
      provider: ProviderCode.telegram,
      targetType: "chat",
      externalTargetId: "chat-123",
      extraField: "should be ignored",
    };
    const result = createTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = createTargetBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// --- updateTargetBodySchema ---

describe("updateTargetBodySchema", () => {
  it("accepts displayName update", () => {
    const body = { displayName: "Renamed" };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(body);
    }
  });

  it("accepts metadata update", () => {
    const body = { metadata: { muted: true } };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("accepts both displayName and metadata together", () => {
    const body = { displayName: "Renamed", metadata: { muted: false } };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("accepts null displayName and null metadata", () => {
    const body = { displayName: null, metadata: null };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("rejects destination field externalTargetId", () => {
    const body = { externalTargetId: "new-destination" };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Destination fields cannot be updated");
    }
  });

  it("rejects destination field provider", () => {
    const body = { provider: "discord" };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Destination fields cannot be updated");
    }
  });

  it("rejects unknown field only (not displayName nor metadata)", () => {
    const body = { unknown: "value" };
    const result = updateTargetBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Only displayName and metadata can be updated");
    }
  });

  it("rejects empty body (no allowed keys present)", () => {
    const result = updateTargetBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Only displayName and metadata can be updated");
    }
  });
});

// --- targetIdParamsSchema ---

describe("targetIdParamsSchema", () => {
  it("accepts a valid UUID", () => {
    const params = { id: "33333333-3333-4333-8333-333333333333" };
    const result = targetIdParamsSchema.safeParse(params);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(params);
    }
  });

  it("rejects a non-UUID string", () => {
    const params = { id: "not-a-uuid" };
    const result = targetIdParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("target id must be a valid UUID");
    }
  });

  it("rejects missing id", () => {
    const result = targetIdParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
