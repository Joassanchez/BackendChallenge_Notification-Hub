export const RETRY_POLICY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 5_000,
  BACKOFF_MULTIPLIER: 2,
  POLL_INTERVAL_MS: 15_000,
  STALE_PROCESSING_THRESHOLD_MS: 60_000,
} as const;

export function computeNextRetryAt(attemptCount: number, now: Date = new Date()): Date {
  const delay = RETRY_POLICY.BASE_DELAY_MS * Math.pow(RETRY_POLICY.BACKOFF_MULTIPLIER, attemptCount - 1);
  return new Date(now.getTime() + delay);
}

export function canRetry(attemptCount: number): boolean {
  return attemptCount < RETRY_POLICY.MAX_ATTEMPTS;
}
