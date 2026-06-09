import { describe, expect, it } from "vitest";
import { RETRY_POLICY, computeNextRetryAt, canRetry } from "../../src/modules/delivery/retry/retry-policy.js";

describe("retry-policy", () => {
  describe("RETRY_POLICY constants", () => {
    it("defines MAX_ATTEMPTS as 3", () => {
      expect(RETRY_POLICY.MAX_ATTEMPTS).toBe(3);
    });

    it("defines BASE_DELAY_MS as 5000", () => {
      expect(RETRY_POLICY.BASE_DELAY_MS).toBe(5_000);
    });

    it("defines BACKOFF_MULTIPLIER as 2", () => {
      expect(RETRY_POLICY.BACKOFF_MULTIPLIER).toBe(2);
    });

    it("defines POLL_INTERVAL_MS as 15000", () => {
      expect(RETRY_POLICY.POLL_INTERVAL_MS).toBe(15_000);
    });

    it("defines STALE_PROCESSING_THRESHOLD_MS as 60000", () => {
      expect(RETRY_POLICY.STALE_PROCESSING_THRESHOLD_MS).toBe(60_000);
    });
  });

  describe("computeNextRetryAt", () => {
    it("returns now + 5s for attemptCount 1 (first retry → second attempt)", () => {
      const now = new Date("2026-06-09T12:00:00.000Z");
      const result = computeNextRetryAt(1, now);
      expect(result.getTime()).toBe(now.getTime() + 5_000);
    });

    it("returns now + 10s for attemptCount 2 (second retry → third attempt)", () => {
      const now = new Date("2026-06-09T12:00:00.000Z");
      const result = computeNextRetryAt(2, now);
      expect(result.getTime()).toBe(now.getTime() + 10_000);
    });

    it("returns now + 20s for attemptCount 3", () => {
      const now = new Date("2026-06-09T12:00:00.000Z");
      const result = computeNextRetryAt(3, now);
      expect(result.getTime()).toBe(now.getTime() + 20_000);
    });
  });

  describe("canRetry", () => {
    it("returns true when attemptCount is 0 (first attempt)", () => {
      expect(canRetry(0)).toBe(true);
    });

    it("returns true when attemptCount is 1", () => {
      expect(canRetry(1)).toBe(true);
    });

    it("returns true when attemptCount is 2 (one more retry allowed)", () => {
      expect(canRetry(2)).toBe(true);
    });

    it("returns false when attemptCount is 3 (MAX_ATTEMPTS reached)", () => {
      expect(canRetry(3)).toBe(false);
    });

    it("returns false when attemptCount is 4 (exceeded)", () => {
      expect(canRetry(4)).toBe(false);
    });
  });
});
