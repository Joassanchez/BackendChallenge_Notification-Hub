import { afterEach, describe, expect, it, vi } from "vitest";

// Prevent side-effect dotenv/config from loading .env during these tests.
// The vitest setup already loads .env.test, and dotenv/config would
// override the explicitly set/cleared vars under test.
vi.mock("dotenv/config", () => ({}));

afterEach(() => {
  vi.resetModules();
});

describe("env — optional webhook/bot env vars", () => {
  it("defaults TELEGRAM_WEBHOOK_SECRET to empty string when unset", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBe("");
  });

  it("defaults TELEGRAM_BOT_USERNAME to empty string when unset", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.TELEGRAM_BOT_USERNAME).toBe("");
  });

  it("defaults DISCORD_PUBLIC_KEY to empty string when unset", async () => {
    delete process.env.DISCORD_PUBLIC_KEY;
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.DISCORD_PUBLIC_KEY).toBe("");
  });

  it("defaults DISCORD_BOT_TOKEN to empty string when unset", async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.DISCORD_BOT_TOKEN).toBe("");
  });

  it("reads TELEGRAM_WEBHOOK_SECRET from process.env", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "my-secret";
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBe("my-secret");
  });

  it("reads DISCORD_BOT_TOKEN from process.env", async () => {
    process.env.DISCORD_BOT_TOKEN = "bot123";
    const { env } = await import("../../../src/shared/config/env.js");
    expect(env.DISCORD_BOT_TOKEN).toBe("bot123");
  });
});
