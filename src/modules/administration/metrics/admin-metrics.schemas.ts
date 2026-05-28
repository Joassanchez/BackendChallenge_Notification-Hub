import { z } from "zod";

const ALLOWED_METRICS_KEYS = new Set<string>([]);

export const getMetricsQuerySchema = z.object({}).passthrough().superRefine((data, ctx) => {
  for (const key of Object.keys(data)) {
    if (!ALLOWED_METRICS_KEYS.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported query parameter: ${key}`,
      });
    }
  }
});
