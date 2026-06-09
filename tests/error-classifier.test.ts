import { describe, expect, it } from "vitest";
import { classifyError } from "../src/modules/delivery/retry/error-classifier.js";
import type { DeliveryProviderResult } from "../src/modules/delivery/adapters/delivery-provider-adapter.js";

describe("error-classifier", () => {
  describe("classifyError", () => {
    it('classifies "success" as NOT retryable — caller handles before classify', () => {
      const result: DeliveryProviderResult = {
        kind: "success",
        httpStatusCode: 200,
        providerMessageId: "msg-1",
      };
      // classifyError is NOT called for success results per design.
      // But if called, it should return "permanent" (success is not retryable).
      expect(classifyError(result)).toBe("permanent");
    });

    it('classifies "failed" as permanent', () => {
      const result: DeliveryProviderResult = {
        kind: "failed",
        errorCode: "MISSING_SECRET",
        errorMessage: "Provider secret is not configured",
      };
      expect(classifyError(result)).toBe("permanent");
    });

    it('classifies "timeout" as retryable', () => {
      const result: DeliveryProviderResult = {
        kind: "timeout",
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: "Provider request timed out",
      };
      expect(classifyError(result)).toBe("retryable");
    });

    it('classifies "provider_error" with httpStatusCode 500 as retryable', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 500,
        errorCode: "TELEGRAM_500",
        errorMessage: "Internal server error",
      };
      expect(classifyError(result)).toBe("retryable");
    });

    it('classifies "provider_error" with httpStatusCode 503 as retryable', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 503,
        errorCode: "TELEGRAM_503",
        errorMessage: "Service unavailable",
      };
      expect(classifyError(result)).toBe("retryable");
    });

    it('classifies "provider_error" with httpStatusCode 502 as retryable', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 502,
        errorCode: "TELEGRAM_502",
        errorMessage: "Bad gateway",
      };
      expect(classifyError(result)).toBe("retryable");
    });

    it('classifies "provider_error" with httpStatusCode 400 as permanent', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 400,
        errorCode: "TELEGRAM_400",
        errorMessage: "Bad request",
      };
      expect(classifyError(result)).toBe("permanent");
    });

    it('classifies "provider_error" with httpStatusCode 403 as permanent', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 403,
        errorCode: "TELEGRAM_403",
        errorMessage: "Forbidden",
      };
      expect(classifyError(result)).toBe("permanent");
    });

    it('classifies "provider_error" with httpStatusCode 404 as permanent', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 404,
        errorCode: "TELEGRAM_404",
        errorMessage: "Not found",
      };
      expect(classifyError(result)).toBe("permanent");
    });

    it('classifies "provider_error" with no httpStatusCode as retryable (adapter exception)', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        errorCode: "ADAPTER_EXCEPTION",
        errorMessage: "Delivery adapter failed unexpectedly",
      };
      expect(classifyError(result)).toBe("retryable");
    });

    it('classifies "provider_error" with httpStatusCode 429 as permanent (rate limited, client error)', () => {
      const result: DeliveryProviderResult = {
        kind: "provider_error",
        httpStatusCode: 429,
        errorCode: "TELEGRAM_429",
        errorMessage: "Too many requests",
      };
      expect(classifyError(result)).toBe("permanent");
    });
  });
});
