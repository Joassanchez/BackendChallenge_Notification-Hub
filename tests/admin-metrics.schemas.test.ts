import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { getMetricsQuerySchema } from "../src/modules/administration/metrics/admin-metrics.schemas.js";

describe("getMetricsQuerySchema", () => {
  it("accepts empty query object", () => {
    const result = getMetricsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects unknown query parameter with exact message format", () => {
    const result = getMetricsQuerySchema.safeParse({ userId: "x" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]!.message).toBe("Unsupported query parameter: userId");
  });

  it("rejects multiple unknown keys", () => {
    const result = getMetricsQuerySchema.safeParse({ foo: "bar", baz: "qux" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    const issues = result.error.issues;
    expect(issues).toHaveLength(2);
    const messages = issues.map((i) => i.message);
    expect(messages).toContain("Unsupported query parameter: foo");
    expect(messages).toContain("Unsupported query parameter: baz");
  });
});
