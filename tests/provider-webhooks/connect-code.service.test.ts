import { describe, expect, it, vi } from "vitest";
import { ConnectCodeService } from "../../src/modules/provider-webhooks/connect-code/connect-code.service.js";
import { AppError } from "../../src/shared/http/errors.js";

const userId = "user-001";
const telegramProvider = "telegram";
const discordProvider = "discord";

/**
 * Sync helper — catches AppError from a sync function and asserts expected properties.
 */
function expectSyncAppError(
  action: () => void,
  expected: { statusCode: number; code: string; message: string },
): void {
  try {
    action();
    expect.unreachable("Expected action to throw an AppError");
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const appErr = err as AppError;
    expect(appErr.statusCode).toBe(expected.statusCode);
    expect(appErr.code).toBe(expected.code);
    expect(appErr.message).toBe(expected.message);
  }
}

describe("ConnectCodeService", () => {
  describe("generate", () => {
    it("returns code, expiresAt (ISO string), and connectUrl", () => {
      const service = new ConnectCodeService("TestBot");
      const result = service.generate(userId, telegramProvider);

      expect(result.code).toMatch(/^[0-9a-f]{6}$/);
      expect(result.expiresAt).toEqual(expect.any(String));
      expect(() => new Date(result.expiresAt)).not.toThrow();
      expect(result.connectUrl).toEqual(expect.any(String));
    });

    it("builds Telegram connectUrl with bot username", () => {
      const service = new ConnectCodeService("TestBot");
      const result = service.generate(userId, telegramProvider);

      expect(result.connectUrl).toMatch(
        /^https:\/\/t\.me\/TestBot\?start=[0-9a-f]{6}$/,
      );
    });

    it("builds Discord connectUrl as /connect instruction", () => {
      const service = new ConnectCodeService("TestBot");
      const result = service.generate(userId, discordProvider);

      expect(result.connectUrl).toMatch(/^\/connect [0-9a-f]{6}$/);
    });

    it("uses empty string in URL when botUsername is not provided", () => {
      const service = new ConnectCodeService();
      const result = service.generate(userId, telegramProvider);

      expect(result.connectUrl).toMatch(/^https:\/\/t\.me\/\?start=[0-9a-f]{6}$/);
    });
  });

  describe("validate", () => {
    it("succeeds with valid unexpired code", () => {
      const service = new ConnectCodeService("TestBot");
      const { code } = service.generate(userId, telegramProvider);

      const result = service.validate(code);

      expect(result).toEqual({ userId, provider: telegramProvider });
    });

    it("throws 'invalid code' for unknown code", () => {
      const service = new ConnectCodeService("TestBot");

      expectSyncAppError(
        () => service.validate("nonexistent"),
        { statusCode: 400, code: "BAD_REQUEST", message: "invalid code" },
      );
    });

    it("throws 'code expired' after TTL", () => {
      vi.useFakeTimers();
      const service = new ConnectCodeService("TestBot");
      const { code } = service.generate(userId, telegramProvider);

      vi.advanceTimersByTime(300_001);

      expectSyncAppError(
        () => service.validate(code),
        { statusCode: 400, code: "BAD_REQUEST", message: "code expired" },
      );

      vi.useRealTimers();
    });

    it("throws 'code already used' on second validate (single-use)", () => {
      const service = new ConnectCodeService("TestBot");
      const { code } = service.generate(userId, telegramProvider);

      // First validate succeeds
      service.validate(code);

      // Second validate must throw
      expectSyncAppError(
        () => service.validate(code),
        { statusCode: 400, code: "BAD_REQUEST", message: "code already used" },
      );
    });

    it("re-generate invalidates prior unused codes for same userId+provider", () => {
      const service = new ConnectCodeService("TestBot");

      // Generate first code
      const first = service.generate(userId, telegramProvider);

      // Generate second code for same userId+provider
      const second = service.generate(userId, telegramProvider);

      // First code should be invalidated (marked consumed)
      expectSyncAppError(
        () => service.validate(first.code),
        { statusCode: 400, code: "BAD_REQUEST", message: "code already used" },
      );

      // Second code should still work
      const result = service.validate(second.code);
      expect(result).toEqual({ userId, provider: telegramProvider });
    });

    it("re-generate for different user does not invalidate prior codes", () => {
      const service = new ConnectCodeService("TestBot");

      const user1Result = service.generate("user-1", telegramProvider);
      const user2Result = service.generate("user-2", telegramProvider);

      // Both codes should be independently valid
      expect(service.validate(user1Result.code)).toEqual({
        userId: "user-1",
        provider: telegramProvider,
      });
      expect(service.validate(user2Result.code)).toEqual({
        userId: "user-2",
        provider: telegramProvider,
      });
    });

    it("re-generate for different provider does not invalidate prior codes", () => {
      const service = new ConnectCodeService("TestBot");

      const telegramResult = service.generate(userId, telegramProvider);
      const discordResult = service.generate(userId, discordProvider);

      // Both codes should be independently valid
      expect(service.validate(telegramResult.code)).toEqual({
        userId,
        provider: telegramProvider,
      });
      expect(service.validate(discordResult.code)).toEqual({
        userId,
        provider: discordProvider,
      });
    });
  });
});
