import { Prisma, type ProviderCode } from "../../generated/prisma/client.js";

export type DeliveryProviderInput = {
  messageId: string;
  deliveryId: string;
  providerCode: ProviderCode;
  content: string;
  targetType: string;
  externalTargetId: string;
  targetMetadata: Prisma.JsonValue | null;
  connectionId: string;
  connectionConfig: Prisma.JsonValue | null;
  resolvedSecret: string | null;
};

export type DeliveryProviderSuccess = {
  kind: "success";
  providerMessageId?: string;
  httpStatusCode?: number;
  providerResponse?: Prisma.InputJsonValue;
};

export type DeliveryProviderFailed = {
  kind: "failed";
  errorCode: string;
  errorMessage: string;
  providerResponse?: Prisma.InputJsonValue;
};

export type DeliveryProviderProviderError = {
  kind: "provider_error";
  errorMessage: string;
  httpStatusCode?: number;
  errorCode?: string;
  providerResponse?: Prisma.InputJsonValue;
};

export type DeliveryProviderTimeout = {
  kind: "timeout";
  errorMessage: string;
  errorCode?: string;
};

export type DeliveryProviderResult =
  | DeliveryProviderSuccess
  | DeliveryProviderFailed
  | DeliveryProviderProviderError
  | DeliveryProviderTimeout;

export type DeliveryProviderAdapter = {
  send(input: DeliveryProviderInput): Promise<DeliveryProviderResult>;
};

export type DeliveryProviderRegistry = Partial<Record<ProviderCode, DeliveryProviderAdapter>>;

export function redactResolvedSecretFromProviderResponse(
  value: Prisma.InputJsonValue | undefined,
  resolvedSecret: string | null,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || resolvedSecret === null || resolvedSecret === "") {
    return value;
  }

  return redactJsonValue(value, resolvedSecret) as Prisma.InputJsonValue;
}

export function redactResolvedSecretFromString(value: string | undefined, resolvedSecret: string | null): string | undefined {
  if (value === undefined || resolvedSecret === null || resolvedSecret === "") {
    return value;
  }

  return value.includes(resolvedSecret) ? value.replaceAll(resolvedSecret, "[REDACTED]") : value;
}

function redactJsonValue(value: Prisma.InputJsonValue, secret: string): Prisma.InputJsonValue {
  if (typeof value === "string") {
    return redactResolvedSecretFromString(value, secret) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, secret));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactResolvedSecretFromString(key, secret) ?? key,
        redactJsonValue(item, secret),
      ]),
    );
  }

  return value;
}
