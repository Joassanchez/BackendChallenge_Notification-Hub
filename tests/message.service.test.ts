import { describe, expect, it, vi } from "vitest";
import { MessageStatus, ProviderCode } from "../src/generated/prisma/client.js";
import { MessageService } from "../src/modules/notifications/messages/message.service.js";
import type { MessageRepository, MessageWithDeliveries } from "../src/modules/notifications/messages/message-repository.js";
import type { DeliveryExecutionService } from "../src/modules/delivery/execution/delivery-execution.service.js";
import {
  buildDelivery,
  buildMessageWithDeliveries,
  discordDestination,
  discordTargetId,
  expectAppError,
  messageId,
  telegramDestination,
  telegramTargetId,
  userId,
} from "./helpers/service-fixtures.js";

function createRepository(input: {
  existingByIdempotencyKey?: MessageWithDeliveries | null;
  createdMessage?: MessageWithDeliveries;
  reloadedMessage?: MessageWithDeliveries | null;
  listedMessages?: MessageWithDeliveries[];
  detailMessage?: MessageWithDeliveries | null;
} = {}) {
  const createdMessage = input.createdMessage ?? buildMessageWithDeliveries();

  return {
    findByIdempotencyKey: vi.fn(async () => input.existingByIdempotencyKey ?? null),
    createPendingMessage: vi.fn(async () => createdMessage),
    findById: vi.fn(async () => input.reloadedMessage ?? createdMessage),
    listForUser: vi.fn(async () => input.listedMessages ?? []),
    findByIdForUser: vi.fn(async () => ("detailMessage" in input ? input.detailMessage : createdMessage)),
  };
}

function createService(input: {
  repository?: ReturnType<typeof createRepository>;
  deliveryExecution?: Pick<DeliveryExecutionService, "executeMessage">;
} = {}) {
  const repository = input.repository ?? createRepository();

  return {
    service: new MessageService(
      repository as unknown as MessageRepository,
      input.deliveryExecution as DeliveryExecutionService | undefined,
    ),
    repository,
  };
}

describe("MessageService", () => {
  it("validates content before persistence", async () => {
    const { service, repository } = createService();

    await expectAppError(
      () => service.create({ userId, content: "   ", destinations: [telegramDestination()] }),
      { statusCode: 400, code: "BAD_REQUEST", message: "content must not be empty" },
    );
    await expectAppError(
      () => service.create({ userId, content: 123, destinations: [telegramDestination()] }),
      { statusCode: 400, code: "BAD_REQUEST", message: "content must be a string" },
    );
    expect(repository.createPendingMessage).not.toHaveBeenCalled();
  });

  it("validates destinations and rejects duplicates before persistence", async () => {
    const { service, repository } = createService();

    await expectAppError(
      () => service.create({ userId, content: "Hello", destinations: [] }),
      { statusCode: 400, code: "BAD_REQUEST", message: "destinations must be a non-empty array" },
    );
    await expectAppError(
      () => service.create({ userId, content: "Hello", destinations: [{ provider: "unknown", targetId: telegramTargetId }] }),
      { statusCode: 400, code: "BAD_REQUEST", message: "destinations[0].provider must be a valid provider code" },
    );
    await expectAppError(
      () => service.create({ userId, content: "Hello", destinations: [{ provider: "telegram", targetId: "not-a-uuid" }] }),
      { statusCode: 400, code: "BAD_REQUEST", message: "destinations[0].targetId must be a valid UUID" },
    );
    await expectAppError(
      () =>
        service.create({
          userId,
          content: "Hello",
          destinations: [telegramDestination(), telegramDestination()],
        }),
      { statusCode: 400, code: "BAD_REQUEST", message: "destinations must not contain duplicates" },
    );
    expect(repository.createPendingMessage).not.toHaveBeenCalled();
  });

  it("creates a message with normalized content and destinations", async () => {
    const createdMessage = buildMessageWithDeliveries({
      content: "Hello",
      deliveries: [buildDelivery({ providerCode: ProviderCode.telegram, targetId: telegramTargetId })],
    });
    const repository = createRepository({ createdMessage });
    const { service } = createService({ repository });

    const result = await service.create({
      userId,
      content: "  Hello  ",
      destinations: [telegramDestination()],
      idempotencyKey: " key-1 ",
    });

    expect(repository.createPendingMessage).toHaveBeenCalledWith({
      userId,
      content: "Hello",
      destinations: [telegramDestination()],
      idempotencyKey: "key-1",
    });
    expect(result).toEqual({
      created: true,
      message: expect.objectContaining({
        messageId: createdMessage.id,
        content: "Hello",
        status: MessageStatus.pending,
      }),
    });
  });

  it("validates list filters before repository lookup", async () => {
    const { service, repository } = createService();

    await expectAppError(
      () => service.list({ userId, status: "unknown" }),
      { statusCode: 400, code: "BAD_REQUEST", message: "status must be a valid message status" },
    );
    await expectAppError(
      () => service.list({ userId, provider: "unknown" }),
      { statusCode: 400, code: "BAD_REQUEST", message: "provider must be a valid provider code" },
    );
    await expectAppError(
      () => service.list({ userId, from: "not-a-date" }),
      { statusCode: 400, code: "BAD_REQUEST", message: "from must be a valid date" },
    );
    await expectAppError(
      () => service.list({ userId, from: "2026-01-02T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" }),
      { statusCode: 400, code: "BAD_REQUEST", message: "from must be before or equal to to" },
    );
    expect(repository.listForUser).not.toHaveBeenCalled();
  });

  it("passes valid list filters to the repository", async () => {
    const repository = createRepository({ listedMessages: [buildMessageWithDeliveries()] });
    const { service } = createService({ repository });

    const result = await service.list({
      userId,
      status: MessageStatus.pending,
      provider: ProviderCode.telegram,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });

    expect(repository.listForUser).toHaveBeenCalledWith(userId, {
      status: MessageStatus.pending,
      provider: ProviderCode.telegram,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(result).toHaveLength(1);
  });

  it("validates detail message UUIDs before repository lookup", async () => {
    const { service, repository } = createService();

    await expectAppError(
      () => service.getById(userId, "not-a-uuid"),
      { statusCode: 400, code: "BAD_REQUEST", message: "message id must be a valid UUID" },
    );
    expect(repository.findByIdForUser).not.toHaveBeenCalled();
  });

  it("returns not found when a valid detail id is outside the user scope", async () => {
    const repository = createRepository({ detailMessage: null });
    const { service } = createService({ repository });

    await expectAppError(
      () => service.getById(userId, messageId),
      { statusCode: 404, code: "NOT_FOUND", message: "Message not found" },
    );
  });

  it("replays idempotent requests without duplicate persistence or delivery execution", async () => {
    const existing = buildMessageWithDeliveries({
      content: "Idempotent",
      deliveries: [
        buildDelivery({ providerCode: ProviderCode.telegram, targetId: telegramTargetId }),
        buildDelivery({ providerCode: ProviderCode.discord, targetId: discordTargetId }),
      ],
    });
    const repository = createRepository({ existingByIdempotencyKey: existing });
    const deliveryExecution = {
      executeMessage: vi.fn(async () => undefined),
    } satisfies Pick<DeliveryExecutionService, "executeMessage">;
    const { service } = createService({ repository, deliveryExecution });

    const result = await service.create({
      userId,
      content: "Idempotent",
      destinations: [discordDestination(), telegramDestination()],
      idempotencyKey: "idem-key",
    });

    expect(result.created).toBe(false);
    expect(result.message.messageId).toBe(existing.id);
    expect(repository.createPendingMessage).not.toHaveBeenCalled();
    expect(deliveryExecution.executeMessage).not.toHaveBeenCalled();
  });

  it("rejects idempotency replay when the payload conflicts", async () => {
    const existing = buildMessageWithDeliveries({
      content: "Original",
      deliveries: [buildDelivery({ providerCode: ProviderCode.telegram, targetId: telegramTargetId })],
    });
    const repository = createRepository({ existingByIdempotencyKey: existing });
    const { service } = createService({ repository });

    await expectAppError(
      () =>
        service.create({
          userId,
          content: "Changed",
          destinations: [telegramDestination()],
          idempotencyKey: "idem-key",
        }),
      { statusCode: 409, code: "CONFLICT", message: "Idempotency-Key was already used with a different payload" },
    );
    expect(repository.createPendingMessage).not.toHaveBeenCalled();
  });

  it("executes delivery once for new idempotent messages and reloads the executed state", async () => {
    const createdMessage = buildMessageWithDeliveries({ status: MessageStatus.pending });
    const executedMessage = buildMessageWithDeliveries({ status: MessageStatus.success });
    const repository = createRepository({ createdMessage, reloadedMessage: executedMessage });
    const deliveryExecution = {
      executeMessage: vi.fn(async () => undefined),
    } satisfies Pick<DeliveryExecutionService, "executeMessage">;
    const { service } = createService({ repository, deliveryExecution });

    const result = await service.create({
      userId,
      content: "Hello team",
      destinations: [telegramDestination()],
      idempotencyKey: "new-key",
    });

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(userId, "new-key");
    expect(repository.createPendingMessage).toHaveBeenCalledTimes(1);
    expect(deliveryExecution.executeMessage).toHaveBeenCalledTimes(1);
    expect(deliveryExecution.executeMessage).toHaveBeenCalledWith(createdMessage.id);
    expect(repository.findById).toHaveBeenCalledWith(createdMessage.id);
    expect(result).toEqual({
      created: true,
      message: expect.objectContaining({ messageId: executedMessage.id, status: MessageStatus.success }),
    });
  });
});
