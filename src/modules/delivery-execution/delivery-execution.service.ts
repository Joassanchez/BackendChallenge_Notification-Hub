import { AttemptStatus, DeliveryStatus, Prisma } from "../../generated/prisma/client.js";
import type { DeliveryConfigResolver } from "./delivery-config-resolver.js";
import type { DeliveryExecutionRepository, DeliveryAttemptWrite, ExecutableDelivery } from "./delivery-execution.repository.js";
import type { DeliveryProviderInput, DeliveryProviderRegistry, DeliveryProviderResult } from "./delivery-provider-adapter.js";
import { redactResolvedSecretFromProviderResponse, redactResolvedSecretFromString } from "./delivery-provider-adapter.js";

export class DeliveryExecutionService {
  constructor(
    private readonly deliveries: DeliveryExecutionRepository,
    private readonly configResolver: DeliveryConfigResolver,
    private readonly adapters: DeliveryProviderRegistry,
  ) {}

  async executeMessage(messageId: string): Promise<void> {
    const deliveries = await this.deliveries.findPendingDeliveriesForMessage(messageId);

    for (const delivery of deliveries) {
      await this.executeDelivery(delivery);
    }
  }

  private async executeDelivery(delivery: ExecutableDelivery): Promise<void> {
    await this.deliveries.markProcessing(delivery.id);

    const inputOrFailure = this.buildInput(delivery);

    if (inputOrFailure.ok === false) {
      await this.deliveries.completeDelivery({
        deliveryId: delivery.id,
        deliveryStatus: DeliveryStatus.failed,
        attempt: failedAttempt(inputOrFailure.errorCode, inputOrFailure.errorMessage),
      });
      return;
    }

    const adapter = this.adapters[delivery.provider.code];

    if (adapter === undefined) {
      await this.deliveries.completeDelivery({
        deliveryId: delivery.id,
        deliveryStatus: DeliveryStatus.failed,
        attempt: failedAttempt("ADAPTER_NOT_FOUND", "No delivery adapter is registered for this provider"),
      });
      return;
    }

    const result = await callAdapterSafely(() => adapter.send(inputOrFailure.input), inputOrFailure.input.resolvedSecret);

    await this.deliveries.completeDelivery({
      deliveryId: delivery.id,
      deliveryStatus: result.kind === "success" ? DeliveryStatus.success : DeliveryStatus.failed,
      attempt: toAttemptWrite(result, inputOrFailure.input.resolvedSecret),
    });
  }

  private buildInput(delivery: ExecutableDelivery): DeliveryInputBuildResult {
    if (!delivery.provider.isActive) {
      return { ok: false, errorCode: "PROVIDER_INACTIVE", errorMessage: "Provider is not active" };
    }

    if (!delivery.target.isActive) {
      return { ok: false, errorCode: "TARGET_INACTIVE", errorMessage: "Notification target is not active" };
    }

    const config = this.configResolver.resolve(delivery.target.providerConnection);

    if (!config.ok) {
      return { ok: false, errorCode: config.errorCode, errorMessage: config.errorMessage };
    }

    return {
      ok: true,
      input: {
        messageId: delivery.messageId,
        deliveryId: delivery.id,
        providerCode: delivery.provider.code,
        content: delivery.message.content,
        targetType: delivery.target.targetType,
        externalTargetId: delivery.target.externalTargetId,
        targetMetadata: delivery.target.metadata,
        connectionId: config.connectionId,
        connectionConfig: config.connectionConfig,
        resolvedSecret: config.resolvedSecret,
      },
    };
  }
}

type DeliveryInputBuildResult =
  | { ok: true; input: DeliveryProviderInput }
  | { ok: false; errorCode: string; errorMessage: string };

async function callAdapterSafely(send: () => Promise<DeliveryProviderResult>, resolvedSecret: string | null): Promise<DeliveryProviderResult> {
  try {
    return await send();
  } catch (error) {
    return {
      kind: "provider_error",
      errorCode: "ADAPTER_EXCEPTION",
      errorMessage: redactResolvedSecretFromString(
        error instanceof Error ? error.message : "Delivery adapter failed unexpectedly",
        resolvedSecret,
      ) ?? "Delivery adapter failed unexpectedly",
    };
  }
}

function toAttemptWrite(result: DeliveryProviderResult, resolvedSecret: string | null): DeliveryAttemptWrite {
  switch (result.kind) {
    case "success":
      return {
        status: AttemptStatus.success,
        httpStatusCode: result.httpStatusCode ?? null,
        providerMessageId: redactString(result.providerMessageId, resolvedSecret) ?? null,
        providerResponse: redactJson(result.providerResponse, resolvedSecret),
      };
    case "failed":
      return failedAttempt(redactString(result.errorCode, resolvedSecret) ?? result.errorCode, redactString(result.errorMessage, resolvedSecret) ?? result.errorMessage, redactJson(result.providerResponse, resolvedSecret));
    case "provider_error":
      return {
        status: AttemptStatus.provider_error,
        httpStatusCode: result.httpStatusCode ?? null,
        providerResponse: redactJson(result.providerResponse, resolvedSecret),
        errorCode: redactString(result.errorCode, resolvedSecret) ?? "PROVIDER_ERROR",
        errorMessage: redactString(result.errorMessage, resolvedSecret) ?? result.errorMessage,
      };
    case "timeout":
      return {
        status: AttemptStatus.timeout,
        errorCode: redactString(result.errorCode, resolvedSecret) ?? "PROVIDER_TIMEOUT",
        errorMessage: redactString(result.errorMessage, resolvedSecret) ?? result.errorMessage,
      };
  }
}

function failedAttempt(
  errorCode: string,
  errorMessage: string,
  providerResponse?: Prisma.InputJsonValue | typeof Prisma.JsonNull,
): DeliveryAttemptWrite {
  return {
    status: AttemptStatus.failed,
    providerResponse: providerResponse ?? Prisma.JsonNull,
    errorCode,
    errorMessage,
  };
}

function redactJson(value: Prisma.InputJsonValue | undefined, resolvedSecret: string | null) {
  return redactResolvedSecretFromProviderResponse(value, resolvedSecret) ?? Prisma.JsonNull;
}

function redactString(value: string | undefined, resolvedSecret: string | null) {
  return redactResolvedSecretFromString(value, resolvedSecret);
}
