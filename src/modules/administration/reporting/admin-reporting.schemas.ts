import { z } from "zod";
import { MessageStatus, ProviderCode } from "../../../generated/prisma/client.js";

const ALLOWED_REPORTING_KEYS = new Set(["userId", "status", "provider", "from", "to"]);

const isoDateTimeWithZonePattern = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;

const MESSAGE_STATUS_VALUES: string[] = Object.values(MessageStatus);
const PROVIDER_CODE_VALUES: string[] = Object.values(ProviderCode);

function isValidMessageStatus(value: string): boolean {
  return MESSAGE_STATUS_VALUES.includes(value);
}

function isValidProviderCode(value: string): boolean {
  return PROVIDER_CODE_VALUES.includes(value);
}

function hasUtcOffsetOrZ(value: string): boolean {
  return isoDateTimeWithZonePattern.test(value);
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export const listMessagesQuerySchema = z
  .object({
    userId: z
      .string({ error: "userId must be a single value" })
      .uuid("userId must be a valid UUID")
      .optional(),
    status: z
      .string()
      .refine(isValidMessageStatus, "status must be a valid message status")
      .optional(),
    provider: z
      .string()
      .refine(isValidProviderCode, "provider must be a valid provider code")
      .optional(),
    from: z
      .string()
      .refine(hasUtcOffsetOrZ, "from must include a UTC offset or Z timezone")
      .refine(isValidDate, "from must be a valid date")
      .optional(),
    to: z
      .string()
      .refine(hasUtcOffsetOrZ, "to must include a UTC offset or Z timezone")
      .refine(isValidDate, "to must be a valid date")
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    for (const key of Object.keys(data)) {
      if (!ALLOWED_REPORTING_KEYS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported query parameter: ${key}`,
        });
      }
    }
  })
  .superRefine((data, ctx) => {
    if (data.from !== undefined && data.to !== undefined) {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);

      if (fromDate.getTime() > toDate.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "from must be before or equal to to",
        });
      }
    }
  });
