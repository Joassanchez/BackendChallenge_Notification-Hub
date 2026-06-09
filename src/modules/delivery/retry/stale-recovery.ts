import type { DeliveryExecutionRepository } from "../execution/delivery-execution.repository.js";
import { RETRY_POLICY } from "./retry-policy.js";

export async function recoverStaleProcessing(repository: DeliveryExecutionRepository): Promise<number> {
  const result = await repository.resetStaleProcessing(RETRY_POLICY.STALE_PROCESSING_THRESHOLD_MS);
  return result.count;
}
