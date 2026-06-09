import type { DeliveryExecutionRepository } from "../execution/delivery-execution.repository.js";
import type { DeliveryExecutionService } from "../execution/delivery-execution.service.js";
import { RETRY_POLICY } from "./retry-policy.js";

export class RetryScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(
    private readonly repository: DeliveryExecutionRepository,
    private readonly executionService: DeliveryExecutionService,
  ) {}

  start(): void {
    if (this.intervalId !== null) {
      return;
    }

    this.intervalId = setInterval(() => {
      void this.poll();
    }, RETRY_POLICY.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const dueRetries = await this.repository.findDueRetries();

      for (const { id } of dueRetries) {
        try {
          const claimed = await this.repository.claimRetry(id);

          if (claimed !== null) {
            await this.executionService.executeDelivery(claimed, true);
          }
        } catch (error) {
          console.error(`[RetryScheduler] Error processing retry for delivery ${id}:`, error);
        }
      }
    } catch (error) {
      console.error("[RetryScheduler] Poll cycle failed:", error);
    } finally {
      this.isPolling = false;
    }
  }
}
