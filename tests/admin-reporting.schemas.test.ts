import { describe, expect, it } from "vitest";
import { MessageStatus, ProviderCode } from "../src/generated/prisma/client.js";
import { listMessagesQuerySchema } from "../src/modules/administration/reporting/admin-reporting.schemas.js";

describe("listMessagesQuerySchema", () => {
  it("accepts empty query object", () => {
    const result = listMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts all allowed query params with valid values", () => {
    const result = listMessagesQuerySchema.safeParse({
      userId: "11111111-1111-4111-8111-111111111111",
      status: MessageStatus.success,
      provider: ProviderCode.telegram,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown query parameter", () => {
    const result = listMessagesQuerySchema.safeParse({ unexpected: "value" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("Unsupported query parameter: unexpected");
  });

  it("rejects userId that is not a valid UUID", () => {
    const result = listMessagesQuerySchema.safeParse({ userId: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("userId must be a valid UUID");
  });

  it("rejects multi-value userId (array)", () => {
    const result = listMessagesQuerySchema.safeParse({ userId: ["uuid1", "uuid2"] });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("userId must be a single value");
  });

  it("rejects invalid message status", () => {
    const result = listMessagesQuerySchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("status must be a valid message status");
  });

  it("rejects invalid provider code", () => {
    const result = listMessagesQuerySchema.safeParse({ provider: "email" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("provider must be a valid provider code");
  });

  it("rejects date missing timezone", () => {
    const result = listMessagesQuerySchema.safeParse({ from: "2026-01-01T00:00:00" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("from must include a UTC offset or Z timezone");
  });

  it("rejects invalid date", () => {
    const result = listMessagesQuerySchema.safeParse({ from: "2026-01-01TnotadateZ" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("from must be a valid date");
  });

  it("rejects from after to (inverted range)", () => {
    const result = listMessagesQuerySchema.safeParse({
      from: "2026-01-03T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues[0]!.message).toBe("from must be before or equal to to");
  });
});
