import { describe, expect, it, vi } from "vitest";
import { AttemptStatus, DeliveryStatus, Prisma, ProviderCode } from "../src/generated/prisma/client.js";
import type { DeliveryConfigResolver, DeliveryConfigResolution } from "../src/modules/delivery-execution/delivery-config-resolver.js";
import { DeliveryExecutionService } from "../src/modules/delivery-execution/delivery-execution.service.js";
import type {
  CompleteDeliveryInput,
  DeliveryExecutionRepository,
  ExecutableDelivery,
} from "../src/modules/delivery-execution/delivery-execution.repository.js";
import type {
  DeliveryProviderAdapter,
  DeliveryProviderRegistry,
  DeliveryProviderResult,
} from "../src/modules/delivery-execution/delivery-provider-adapter.js";
import { messageId, telegramTargetId } from "./helpers/service-fixtures.js";

const deliveryId = "66666666-6666-4666-8666-666666666666";
const providerId = "77777777-7777-4777-8777-777777777777";
const connectionId = "88888888-8888-4888-8888-888888888888";
const userId = "99999999-9999-4999-8999-999999999999";

function buildExecutableDelivery(input: {
  providerCode?: ProviderCode;
  providerActive?: boolean;
  targetActive?: boolean;
  secretRef?: string | null;
  connectionConfig?: Prisma.JsonValue | null;
} = {}): ExecutableDelivery {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const providerCode = input.providerCode ?? ProviderCode.telegram;

  return {
    id: deliveryId,
    messageId,
    providerId,
    targetId: telegramTargetId,
    status: DeliveryStatus.pending,
    attemptCount: 0,
    nextRetryAt: null,
    sentAt: null,
    createdAt,
    updatedAt: createdAt,
    message: {
      id: messageId,
      userId,
      content: "Hello delivery",
      status: "pending",
      idempotencyKey: null,
      createdAt,
      updatedAt: createdAt,
    },
    provider: {
      id: providerId,
      code: providerCode,
      name: providerCode,
      isActive: input.providerActive ?? true,
      createdAt,
      updatedAt: createdAt,
    },
    target: {
      id: telegramTargetId,
      userId,
      providerId,
      providerConnectionId: connectionId,
      externalTargetId: "chat-123",
      targetType: "chat",
      displayName: "Telegram chat",
      metadata: { locale: "en" },
      isActive: input.targetActive ?? true,
      createdAt,
      updatedAt: createdAt,
      providerConnection: {
        id: connectionId,
        providerId,
        name: "telegram-primary",
        authType: "bot-token",
        secretRef: input.secretRef ?? null,
        config: input.connectionConfig ?? { parseMode: "Markdown" },
        isActive: true,
        createdAt,
        updatedAt: createdAt,
      },
    },
  } satisfies ExecutableDelivery;
}

function createService(input: {
  deliveries?: ExecutableDelivery[];
  configResolution?: DeliveryConfigResolution;
  adapters?: DeliveryProviderRegistry;
} = {}) {
  const completed: CompleteDeliveryInput[] = [];
  const deliveries = {
    findPendingDeliveriesForMessage: vi.fn(async () => input.deliveries ?? [buildExecutableDelivery()]),
    markProcessing: vi.fn(async () => undefined),
    completeDelivery: vi.fn(async (payload: CompleteDeliveryInput) => {
      completed.push(payload);
      return undefined;
    }),
  };
  const configResolver = {
    resolve: vi.fn((): DeliveryConfigResolution => {
      const defaultResolution: DeliveryConfigResolution = {
        ok: true,
        connectionId,
        connectionConfig: { parseMode: "Markdown" },
        resolvedSecret: "resolved-secret",
      };

      return input.configResolution ?? defaultResolution;
    }),
  } satisfies Pick<DeliveryConfigResolver, "resolve">;

  return {
    service: new DeliveryExecutionService(
      deliveries as unknown as DeliveryExecutionRepository,
      configResolver as DeliveryConfigResolver,
      input.adapters ?? {},
    ),
    deliveries,
    configResolver,
    completed,
  };
}

function adapterReturning(result: DeliveryProviderResult): DeliveryProviderAdapter {
  return {
    send: vi.fn(async () => result),
  };
}

describe("DeliveryExecutionService", () => {
  it("marks delivery failed when provider config cannot be resolved", async () => {
    const { service, deliveries, completed } = createService({
      configResolution: { ok: false, errorCode: "MISSING_SECRET", errorMessage: "Provider secret is not configured" },
    });

    await service.executeMessage(messageId);

    expect(deliveries.markProcessing).toHaveBeenCalledWith(deliveryId);
    expect(completed).toEqual([
      {
        deliveryId,
        deliveryStatus: DeliveryStatus.failed,
        attempt: {
          status: AttemptStatus.failed,
          providerResponse: Prisma.JsonNull,
          errorCode: "MISSING_SECRET",
          errorMessage: "Provider secret is not configured",
        },
      },
    ]);
  });

  it("marks delivery failed when no adapter is registered for the provider", async () => {
    const { service, completed } = createService();

    await service.executeMessage(messageId);

    expect(completed).toEqual([
      expect.objectContaining({
        deliveryId,
        deliveryStatus: DeliveryStatus.failed,
        attempt: expect.objectContaining({
          status: AttemptStatus.failed,
          errorCode: "ADAPTER_NOT_FOUND",
          errorMessage: "No delivery adapter is registered for this provider",
        }),
      }),
    ]);
  });

  it("sends normalized input to the adapter and persists successful attempts", async () => {
    const adapter = adapterReturning({
      kind: "success",
      httpStatusCode: 202,
      providerMessageId: "provider-message-1",
      providerResponse: { ok: true },
    });
    const { service, completed } = createService({ adapters: { [ProviderCode.telegram]: adapter } });

    await service.executeMessage(messageId);

    expect(adapter.send).toHaveBeenCalledWith({
      messageId,
      deliveryId,
      providerCode: ProviderCode.telegram,
      content: "Hello delivery",
      targetType: "chat",
      externalTargetId: "chat-123",
      targetMetadata: { locale: "en" },
      connectionId,
      connectionConfig: { parseMode: "Markdown" },
      resolvedSecret: "resolved-secret",
    });
    expect(completed).toEqual([
      {
        deliveryId,
        deliveryStatus: DeliveryStatus.success,
        attempt: {
          status: AttemptStatus.success,
          httpStatusCode: 202,
          providerMessageId: "provider-message-1",
          providerResponse: { ok: true },
        },
      },
    ]);
  });

  it.each([
    [
      "failed",
      { kind: "failed", errorCode: "INVALID_TARGET", errorMessage: "Invalid target", providerResponse: { reason: "bad target" } },
      {
        status: AttemptStatus.failed,
        providerResponse: { reason: "bad target" },
        errorCode: "INVALID_TARGET",
        errorMessage: "Invalid target",
      },
    ],
    [
      "timeout",
      { kind: "timeout", errorCode: "PROVIDER_TIMEOUT", errorMessage: "Provider request timed out" },
      {
        status: AttemptStatus.timeout,
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: "Provider request timed out",
      },
    ],
    [
      "provider_error",
      {
        kind: "provider_error",
        httpStatusCode: 503,
        errorCode: "TELEGRAM_503",
        errorMessage: "telegram provider returned 503",
        providerResponse: { error: "unavailable" },
      },
      {
        status: AttemptStatus.provider_error,
        httpStatusCode: 503,
        providerResponse: { error: "unavailable" },
        errorCode: "TELEGRAM_503",
        errorMessage: "telegram provider returned 503",
      },
    ],
  ] satisfies Array<[string, DeliveryProviderResult, CompleteDeliveryInput["attempt"]]>)(
    "maps %s adapter outcomes to failed delivery attempts",
    async (_name, result, expectedAttempt) => {
      const { service, completed } = createService({ adapters: { [ProviderCode.telegram]: adapterReturning(result) } });

      await service.executeMessage(messageId);

      expect(completed).toEqual([
        {
          deliveryId,
          deliveryStatus: DeliveryStatus.failed,
          attempt: expectedAttempt,
        },
      ]);
    },
  );

  it("redacts resolved secrets from adapter results and thrown adapter errors", async () => {
    const secret = "resolved-secret";
    const providerErrorAdapter = adapterReturning({
      kind: "provider_error",
      httpStatusCode: 500,
      errorCode: `ERR_${secret}`,
      errorMessage: `token ${secret} leaked`,
      providerResponse: {
        url: `https://provider.test/${secret}`,
        nested: { [`key-${secret}`]: `value-${secret}` },
      },
    });
    const thrownAdapter = {
      send: vi.fn(async () => {
        throw new Error(`adapter exploded with ${secret}`);
      }),
    } satisfies DeliveryProviderAdapter;
    const deliveries = [
      buildExecutableDelivery(),
      buildExecutableDelivery({ providerCode: ProviderCode.discord }),
    ];
    const { service, completed } = createService({
      deliveries,
      adapters: {
        [ProviderCode.telegram]: providerErrorAdapter,
        [ProviderCode.discord]: thrownAdapter,
      },
    });

    await service.executeMessage(messageId);

    expect(JSON.stringify(completed)).not.toContain(secret);
    expect(completed).toEqual([
      expect.objectContaining({
        attempt: expect.objectContaining({
          status: AttemptStatus.provider_error,
          errorCode: "ERR_[REDACTED]",
          errorMessage: "token [REDACTED] leaked",
          providerResponse: {
            url: "https://provider.test/[REDACTED]",
            nested: { "key-[REDACTED]": "value-[REDACTED]" },
          },
        }),
      }),
      expect.objectContaining({
        attempt: expect.objectContaining({
          status: AttemptStatus.provider_error,
          errorCode: "ADAPTER_EXCEPTION",
          errorMessage: "adapter exploded with [REDACTED]",
        }),
      }),
    ]);
  });
});
