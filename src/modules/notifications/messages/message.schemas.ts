import { z } from "zod";
import { MessageStatus, ProviderCode } from "../../../generated/prisma/client.js";

// --- Constants mirroring current service validation ---

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESSAGE_STATUS_VALUES: string[] = Object.values(MessageStatus);
const PROVIDER_CODE_VALUES: string[] = Object.values(ProviderCode);

function isMessageStatus(value: string): boolean {
  return MESSAGE_STATUS_VALUES.includes(value);
}

function isProviderCode(value: string): boolean {
  return PROVIDER_CODE_VALUES.includes(value);
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function destinationKey(provider: string, targetId: string): string {
  return `${provider}:${targetId}`;
}

// --- createMessageBodySchema ---

const destinationShape = z.object({
  provider: z.string(),
  targetId: z.string(),
});

export const createMessageBodySchema = z
  .object({
    content: z.string({ error: "content must be a string" }).refine(
      (v) => v.trim().length > 0,
      "content must not be empty",
    ),
    destinations: z
      .array(destinationShape)
      .min(1, "destinations must be a non-empty array"),
  })
  .strict()
  .refine(
    (data) => {
      const keys = data.destinations.map((d) => destinationKey(d.provider, d.targetId));
      return new Set(keys).size === keys.length;
    },
    { message: "destinations must not contain duplicates" },
  )
  .superRefine((data, ctx) => {
    data.destinations.forEach((dest, i) => {
      if (!isProviderCode(dest.provider)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `destinations[${i}].provider must be a valid provider code`,
        });
      }
      if (!uuidPattern.test(dest.targetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `destinations[${i}].targetId must be a valid UUID`,
        });
      }
    });
  });

// --- listMessagesQuerySchema ---

const ALLOWED_MESSAGE_QUERY_KEYS = new Set(["status", "provider", "from", "to"]);

export const listMessagesQuerySchema = z
  .object({
    status: z
      .string()
      .refine(isMessageStatus, "status must be a valid message status")
      .optional(),
    provider: z
      .string()
      .refine(isProviderCode, "provider must be a valid provider code")
      .optional(),
    from: z
      .string()
      .refine(isValidDate, "from must be a valid date")
      .optional(),
    to: z
      .string()
      .refine(isValidDate, "to must be a valid date")
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    for (const key of Object.keys(data)) {
      if (!ALLOWED_MESSAGE_QUERY_KEYS.has(key)) {
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

// --- messageIdParamsSchema ---

export const messageIdParamsSchema = z.object({
  id: z.string().refine((v) => uuidPattern.test(v), "message id must be a valid UUID"),
});

// --- idempotencyKeyHeaderSchema ---

export const idempotencyKeyHeaderSchema = z
  .object({
    "idempotency-key": z
      .string()
      .refine((v) => v.trim().length > 0, "Idempotency-Key must not be empty")
      .optional(),
  })
  .passthrough();
