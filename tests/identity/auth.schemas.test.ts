import { describe, expect, it } from "vitest";

// Import schemas — they do NOT exist yet, this is the RED step
import { registerBodySchema, loginBodySchema } from "../../src/modules/identity/auth/auth.schemas.js";

describe("registerBodySchema", () => {
  it("accepts valid registration with just username and password", () => {
    const result = registerBodySchema.safeParse({ username: "alice", password: "secret" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("alice");
      expect(result.data.password).toBe("secret");
    }
  });

  it("accepts valid registration with username, email, and password", () => {
    const result = registerBodySchema.safeParse({
      username: "alice",
      email: "alice@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing username", () => {
    const result = registerBodySchema.safeParse({ password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username is required");
    }
  });

  it("rejects empty username", () => {
    const result = registerBodySchema.safeParse({ username: "", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username is required");
    }
  });

  it("rejects whitespace-only username", () => {
    const result = registerBodySchema.safeParse({ username: "   ", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username is required");
    }
  });

  it("rejects email without @ symbol", () => {
    const result = registerBodySchema.safeParse({
      username: "alice",
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("email must be valid");
    }
  });

  it("accepts email when absent (optional field)", () => {
    const result = registerBodySchema.safeParse({ username: "alice", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("accepts empty-string email as equivalent to absent", () => {
    const result = registerBodySchema.safeParse({
      username: "alice",
      email: "",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = registerBodySchema.safeParse({ username: "alice" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("password is required");
    }
  });

  it("rejects empty password", () => {
    const result = registerBodySchema.safeParse({ username: "alice", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("password is required");
    }
  });

  it("rejects unknown fields via strict mode", () => {
    const result = registerBodySchema.safeParse({
      username: "alice",
      password: "secret",
      role: "admin",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Unrecognized") || m.includes("unrecognized"))).toBe(true);
    }
  });

  it("collects all validation errors at once", () => {
    const result = registerBodySchema.safeParse({
      username: "",
      email: "bad-email",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username is required");
      expect(messages).toContain("email must be valid");
      expect(messages).toContain("password is required");
    }
  });
});

describe("loginBodySchema", () => {
  it("accepts login with username and password", () => {
    const result = loginBodySchema.safeParse({ username: "alice", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("accepts login with email and password", () => {
    const result = loginBodySchema.safeParse({ email: "alice@example.com", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("accepts login with identifier and password", () => {
    const result = loginBodySchema.safeParse({ identifier: "alice", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects login with no identifier at all", () => {
    const result = loginBodySchema.safeParse({ password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username/email is required");
    }
  });

  it("rejects login with whitespace-only identifier", () => {
    const result = loginBodySchema.safeParse({ identifier: "   ", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username/email is required");
    }
  });

  it("rejects login with empty-string identifier", () => {
    const result = loginBodySchema.safeParse({ identifier: "", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username/email is required");
    }
  });

  it("rejects missing password", () => {
    const result = loginBodySchema.safeParse({ username: "alice" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("password is required");
    }
  });

  it("rejects empty password", () => {
    const result = loginBodySchema.safeParse({ username: "alice", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("password is required");
    }
  });

  it("rejects unknown fields via strict mode", () => {
    const result = loginBodySchema.safeParse({
      username: "alice",
      password: "secret",
      role: "admin",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Unrecognized") || m.includes("unrecognized"))).toBe(true);
    }
  });

  it("accepts login when multiple identifier fields are present", () => {
    const result = loginBodySchema.safeParse({
      username: "alice",
      email: "alice@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("collects all validation errors at once", () => {
    const result = loginBodySchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("username/email is required");
      expect(messages).toContain("password is required");
    }
  });
});
