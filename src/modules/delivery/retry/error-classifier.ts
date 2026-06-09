import type { DeliveryProviderResult } from "../adapters/delivery-provider-adapter.js";

export type ErrorClassification = "retryable" | "permanent";

export function classifyError(result: DeliveryProviderResult): ErrorClassification {
  if (result.kind === "success") {
    return "permanent";
  }

  if (result.kind === "failed") {
    return "permanent";
  }

  if (result.kind === "timeout") {
    return "retryable";
  }

  // provider_error
  if (result.httpStatusCode === undefined) {
    return "retryable";
  }

  if (result.httpStatusCode >= 500) {
    return "retryable";
  }

  // 400-499
  return "permanent";
}
