import { z } from "zod";
import { ProviderCode } from "../../../generated/prisma/client.js";

// --- Constants mirroring current service validation ---

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROVIDER_CODE_VALUES: string[] = Object.values(ProviderCode);

const allowedTargetTypes: Readonly<Record<string, string>> = {
  [ProviderCode.telegram]: "chat",
  [ProviderCode.discord]: "webhook",
};

function isProviderCode(value: string): boolean {
  return PROVIDER_CODE_VALUES.includes(value);
}

function validateProviderTargetType(provider: string, targetType: string): boolean {
  if (provider !== ProviderCode.telegram && provider !== ProviderCode.discord) {
    return false;
  }

  return allowedTargetTypes[provider] === targetType;
}

const updateAllowedKeys = ["displayName", "metadata"];
const forbiddenUpdateKeys = ["provider", "providerConnectionId", "externalTargetId", "targetType"];

// --- createTargetBodySchema ---

export const createTargetBodySchema = z
  .object({
    provider: z.string().refine(isProviderCode, "provider must be a valid provider code"),
    targetType: z.string().refine((v) => v.trim().length > 0, "targetType must not be empty"),
    externalTargetId: z.string().refine((v) => v.trim().length > 0, "externalTargetId must not be empty"),
    displayName: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough()
  .refine((data) => !("providerConnectionId" in data), {
    message: "providerConnectionId is not accepted",
  })
  .refine((data) => validateProviderTargetType(data.provider, data.targetType), {
    message: "provider target type is not supported",
  });

// --- updateTargetBodySchema ---

export const updateTargetBodySchema = z
  .object({
    displayName: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const keys = Object.keys(data);

    for (const key of keys) {
      if (!updateAllowedKeys.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.unrecognized_keys,
          keys: [key],
          message: `Unrecognized key: "${key}"`,
        });
      }
    }

    if (forbiddenUpdateKeys.some((key) => key in data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Destination fields cannot be updated",
      });
    }

    if (!keys.some((key) => updateAllowedKeys.includes(key))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only displayName and metadata can be updated",
      });
    }
  });

// --- targetIdParamsSchema ---

export const targetIdParamsSchema = z.object({
  id: z.string().refine((v) => uuidPattern.test(v), "target id must be a valid UUID"),
});
