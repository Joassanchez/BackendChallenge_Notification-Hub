import { Prisma, ProviderCode } from "../../../generated/prisma/client.js";
import type { DeliveryProviderAdapter, DeliveryProviderInput, DeliveryProviderRegistry, DeliveryProviderResult } from "../adapters/delivery-provider-adapter.js";

const defaultTimeoutMs = 5_000;

export function createProductionDeliveryProviderRegistry(): DeliveryProviderRegistry {
  return {
    [ProviderCode.telegram]: new TelegramDeliveryProviderAdapter(),
    [ProviderCode.discord]: new DiscordDeliveryProviderAdapter(),
  };
}

class TelegramDeliveryProviderAdapter implements DeliveryProviderAdapter {
  async send(input: DeliveryProviderInput): Promise<DeliveryProviderResult> {
    if (input.resolvedSecret === null) {
      return missingSecret();
    }

    if (input.targetType !== "chat") {
      return invalidTarget("Telegram delivery requires targetType=chat");
    }

    const url = `https://api.telegram.org/bot${input.resolvedSecret}/sendMessage`;
    const response = await callProvider(() =>
      postJsonWithTimeout(url, {
        chat_id: input.externalTargetId,
        text: input.content,
      }),
    );

    return response.ok ? toProviderResult(response.response, "telegram") : response.result;
  }
}

class DiscordDeliveryProviderAdapter implements DeliveryProviderAdapter {
  async send(input: DeliveryProviderInput): Promise<DeliveryProviderResult> {
    if (input.targetType === "channel") {
      if (input.resolvedSecret === null) {
        return missingSecret();
      }

      const url = `https://discord.com/api/v10/channels/${input.externalTargetId}/messages`;
      const response = await callProvider(() =>
        postJsonWithTimeout(url, { content: input.content }, {
          "Authorization": `Bot ${input.resolvedSecret}`,
        }),
      );

      return response.ok ? toProviderResult(response.response, "discord") : response.result;
    }

    if (input.targetType === "webhook") {
      const webhookUrl = resolveDiscordWebhookUrl(input);

      if (webhookUrl === null) {
        return invalidTarget("Discord delivery requires a webhook URL in the target or provider config");
      }

      const response = await callProvider(() =>
        postJsonWithTimeout(webhookUrl, {
          content: input.content,
        }),
      );

      return response.ok ? toProviderResult(response.response, "discord") : response.result;
    }

    return invalidTarget("Discord delivery requires targetType webhook or channel");
  }
}

function resolveDiscordWebhookUrl(input: DeliveryProviderInput): string | null {
  if (input.targetType === "webhook" && input.externalTargetId.startsWith("https://")) {
    return input.externalTargetId;
  }

  const configuredUrl = readStringFromRecord(input.connectionConfig, "webhookUrl");
  return configuredUrl ?? null;
}

async function postJsonWithTimeout(url: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), defaultTimeoutMs);

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ProviderTimeoutError("Provider request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callProvider(
  send: () => Promise<Response>,
): Promise<{ ok: true; response: Response } | { ok: false; result: DeliveryProviderResult }> {
  try {
    return { ok: true, response: await send() };
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      return {
        ok: false,
        result: {
          kind: "timeout",
          errorCode: "PROVIDER_TIMEOUT",
          errorMessage: error.message,
        },
      };
    }

    throw error;
  }
}

async function toProviderResult(response: Response, provider: string): Promise<DeliveryProviderResult> {
  const providerResponse = await readProviderResponse(response);

  if (response.ok) {
    const providerMessageId = readProviderMessageId(providerResponse);

    return {
      kind: "success",
      httpStatusCode: response.status,
      providerResponse,
      ...(providerMessageId === undefined ? {} : { providerMessageId }),
    };
  }

  return {
    kind: "provider_error",
    httpStatusCode: response.status,
    errorCode: `${provider.toUpperCase()}_${response.status}`,
    errorMessage: `${provider} provider returned ${response.status}`,
    providerResponse,
  };
}

async function readProviderResponse(response: Response) {
  const text = await response.text();

  if (text.trim() === "") {
    return { status: response.status };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    return toJsonValue(parsed);
  } catch {
    return { body: text, status: response.status };
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return { value: null };
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)])) as Prisma.InputJsonValue;
  }

  return String(value);
}

function readProviderMessageId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const result = record.result;

  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    const messageId = (result as Record<string, unknown>).message_id;
    return typeof messageId === "number" || typeof messageId === "string" ? String(messageId) : undefined;
  }

  const id = record.id;
  return typeof id === "string" ? id : undefined;
}

function readStringFromRecord(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : undefined;
}

function missingSecret(): DeliveryProviderResult {
  return {
    kind: "failed",
    errorCode: "MISSING_SECRET",
    errorMessage: "Provider secret is not configured",
  };
}

function invalidTarget(errorMessage: string): DeliveryProviderResult {
  return {
    kind: "failed",
    errorCode: "INVALID_TARGET",
    errorMessage,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

class ProviderTimeoutError extends Error {}
