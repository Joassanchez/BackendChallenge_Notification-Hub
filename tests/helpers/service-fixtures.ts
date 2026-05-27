import { expect } from "vitest";
import { DeliveryStatus, MessageStatus, ProviderCode, RoleCode } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/shared/http/errors.js";
import type { UserWithRoles } from "../../src/modules/users/user-mapper.js";
import type { MessageWithDeliveries, NormalizedDestination } from "../../src/modules/messages/message-repository.js";

export const userId = "11111111-1111-4111-8111-111111111111";
export const messageId = "22222222-2222-4222-8222-222222222222";
export const telegramTargetId = "33333333-3333-4333-8333-333333333333";
export const discordTargetId = "44444444-4444-4444-8444-444444444444";

export function buildUserWithRoles(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userId,
    username: "vitest_user",
    email: "vitest@example.com",
    passwordHash: "hashed-password",
    isActive: true,
    createdAt,
    updatedAt: createdAt,
    lastLoginAt: null,
    roles: [
      {
        userId,
        roleId: "55555555-5555-4555-8555-555555555555",
        assignedAt: createdAt,
        role: {
          id: "55555555-5555-4555-8555-555555555555",
          code: RoleCode.USER,
          name: "Default user",
          createdAt,
        },
      },
    ],
    ...overrides,
  };
}

export function telegramDestination(targetId = telegramTargetId): NormalizedDestination {
  return { provider: ProviderCode.telegram, targetId };
}

export function discordDestination(targetId = discordTargetId): NormalizedDestination {
  return { provider: ProviderCode.discord, targetId };
}

export function buildMessageWithDeliveries(
  overrides: Partial<Omit<MessageWithDeliveries, "deliveries">> & {
    deliveries?: MessageWithDeliveries["deliveries"];
  } = {},
): MessageWithDeliveries {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const deliveries = overrides.deliveries ?? [buildDelivery({ providerCode: ProviderCode.telegram, targetId: telegramTargetId })];

  return {
    id: messageId,
    userId,
    content: "Hello team",
    status: MessageStatus.pending,
    idempotencyKey: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
    deliveries,
  };
}

export function buildDelivery(input: {
  providerCode: ProviderCode;
  targetId: string;
  id?: string;
  status?: DeliveryStatus;
}): MessageWithDeliveries["deliveries"][number] {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const providerId = `${input.providerCode}-provider-id`;

  return {
    id: input.id ?? `${input.providerCode}-delivery-id`,
    messageId,
    providerId,
    targetId: input.targetId,
    status: input.status ?? DeliveryStatus.pending,
    attemptCount: 0,
    nextRetryAt: null,
    sentAt: null,
    createdAt,
    updatedAt: createdAt,
    provider: {
      id: providerId,
      code: input.providerCode,
      name: input.providerCode,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

export async function expectAppError(
  action: () => Promise<unknown>,
  expected: { statusCode: number; code: string; message?: string },
): Promise<AppError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.statusCode).toBe(expected.statusCode);
    expect(appError.code).toBe(expected.code);

    if (expected.message !== undefined) {
      expect(appError.message).toBe(expected.message);
    }

    return appError;
  }

  throw new Error("Expected action to throw AppError");
}
