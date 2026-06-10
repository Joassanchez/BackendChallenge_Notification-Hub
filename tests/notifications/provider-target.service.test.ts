import { describe, expect, it, vi } from "vitest";
import { ProviderCode, type Prisma } from "../../src/generated/prisma/client.js";
import type { NotificationTargetRepository, NotificationTargetWithProvider } from "../../src/modules/notifications/notification-targets/notification-target.repository.js";
import { NotificationTargetService } from "../../src/modules/notifications/notification-targets/notification-target.service.js";
import type { ProviderConnectionRepository, ProviderConnectionWithProvider } from "../../src/modules/delivery/provider-connections/provider-connection.repository.js";
import { ProviderConnectionService } from "../../src/modules/delivery/provider-connections/provider-connection.service.js";
import type { ProviderRepository } from "../../src/modules/delivery/providers/provider.repository.js";
import { ProviderService } from "../../src/modules/delivery/providers/provider.service.js";
import { expectAppError, telegramTargetId } from "../helpers/service-fixtures.js";

const userId = "11111111-1111-4111-8111-111111111111";
const providerId = "77777777-7777-4777-8777-777777777777";
const connectionId = "88888888-8888-4888-8888-888888888888";
const discordConnectionId = "99999999-9999-4999-8999-999999999999";

function buildProvider(input: { code?: ProviderCode; active?: boolean } = {}) {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const code = input.code ?? ProviderCode.telegram;

  return {
    id: providerId,
    code,
    name: code === ProviderCode.telegram ? "Telegram" : "Discord",
    isActive: input.active ?? true,
    createdAt,
    updatedAt: createdAt,
  };
}

function buildProviderConnection(input: {
  id?: string;
  providerCode?: ProviderCode;
  secretRef?: string | null;
  active?: boolean;
} = {}): ProviderConnectionWithProvider {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const provider = input.providerCode === undefined ? buildProvider() : buildProvider({ code: input.providerCode });

  return {
    id: input.id ?? connectionId,
    providerId: provider.id,
    name: `${provider.code}-primary`,
    authType: "bot-token",
    secretRef: input.secretRef ?? null,
    config: { environment: "test" },
    isActive: input.active ?? true,
    createdAt,
    updatedAt: createdAt,
    provider,
  };
}

function buildTarget(input: {
  id?: string;
  providerCode?: ProviderCode;
  externalTargetId?: string;
  targetType?: string;
  displayName?: string | null;
  metadata?: Prisma.JsonValue | null;
  active?: boolean;
} = {}): NotificationTargetWithProvider {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const provider = input.providerCode === undefined ? buildProvider() : buildProvider({ code: input.providerCode });

  return {
    id: input.id ?? telegramTargetId,
    userId,
    providerId: provider.id,
    providerConnectionId: connectionId,
    externalTargetId: input.externalTargetId ?? "chat-123",
    targetType: input.targetType ?? "chat",
    displayName: input.displayName ?? "Primary target",
    metadata: input.metadata ?? { muted: false },
    isActive: input.active ?? true,
    createdAt,
    updatedAt: createdAt,
    provider,
  };
}

function createProviderServices(input: { connections?: ProviderConnectionWithProvider[] } = {}) {
  const providers = {
    findActiveProviders: vi.fn(async () => [buildProvider(), buildProvider({ code: ProviderCode.discord })]),
  };
  const providerConnections = {
    findProviderConnectionsForAdmin: vi.fn(async () => input.connections ?? []),
  };

  return {
    providerService: new ProviderService(providers as unknown as ProviderRepository),
    providerConnectionService: new ProviderConnectionService(providerConnections as unknown as ProviderConnectionRepository),
    providers,
    providerConnections,
  };
}

function createTargetService(input: {
  provider?: ReturnType<typeof buildProvider> | null;
  activeConnections?: Array<{ id: string; authType?: string }>;
  duplicate?: NotificationTargetWithProvider | null;
  existing?: NotificationTargetWithProvider | null;
  createdTarget?: NotificationTargetWithProvider;
  updatedTarget?: NotificationTargetWithProvider;
} = {}) {
  const createdTarget = input.createdTarget ?? buildTarget();
  const updatedTarget = input.updatedTarget ?? buildTarget({ displayName: "Renamed", metadata: { muted: true } });
  const targets = {
    listForUser: vi.fn(async () => [buildTarget()]),
    findProviderByCode: vi.fn(async () => ("provider" in input ? input.provider : buildProvider())),
    findActiveConnectionsForProvider: vi.fn(async () => input.activeConnections ?? [{ id: connectionId, authType: "bot-token" }]),
    findActiveDuplicate: vi.fn(async () => input.duplicate ?? null),
    create: vi.fn(async () => createdTarget),
    findForUser: vi.fn(async () => ("existing" in input ? input.existing : buildTarget())),
    updateForUser: vi.fn(async () => updatedTarget),
    setActiveForUser: vi.fn(async (_userId: string, _targetId: string, isActive: boolean) => buildTarget({ active: isActive })),
  };

  return {
    service: new NotificationTargetService(targets as unknown as NotificationTargetRepository),
    targets,
  };
}

describe("Provider and ProviderConnection services", () => {
  it("lists active providers without connection secrets and masks admin connection secret refs", async () => {
    const { providerService, providerConnectionService } = createProviderServices({
      connections: [
        buildProviderConnection({ secretRef: "TELEGRAM_BOT_TOKEN" }),
        buildProviderConnection({ id: discordConnectionId, providerCode: ProviderCode.discord, secretRef: null }),
      ],
    });

    await expect(providerService.listActiveProviders()).resolves.toEqual({
      providers: [
        { code: ProviderCode.telegram, name: "Telegram" },
        { code: ProviderCode.discord, name: "Discord" },
      ],
    });

    await expect(providerConnectionService.listProviderConnectionsForAdmin()).resolves.toEqual({
      providerConnections: [
        expect.objectContaining({
          id: connectionId,
          providerCode: ProviderCode.telegram,
          maskedSecretRef: "***",
        }),
        expect.objectContaining({
          id: discordConnectionId,
          providerCode: ProviderCode.discord,
          maskedSecretRef: null,
        }),
      ],
    });
  });
});

describe("NotificationTargetService", () => {
  it("rejects inactive, missing, or mismatched provider connection resolution", async () => {
    const inactiveProvider = createTargetService({ provider: buildProvider({ active: false }) });
    await expectAppError(
      () =>
        inactiveProvider.service.create({
          userId,
          provider: ProviderCode.telegram,
          externalTargetId: "chat-1",
          targetType: "chat",
        }),
      { statusCode: 400, code: "BAD_REQUEST", message: "Provider is not available" },
    );

    const noConnection = createTargetService({ activeConnections: [] });
    await expectAppError(
      () =>
        noConnection.service.create({
          userId,
          provider: ProviderCode.telegram,
          externalTargetId: "chat-1",
          targetType: "chat",
        }),
      { statusCode: 400, code: "BAD_REQUEST", message: "Provider has no active connection" },
    );

    const mismatchedConnection = createTargetService({ activeConnections: [{ id: connectionId, authType: "webhook" }] });
    await expectAppError(
      () =>
        mismatchedConnection.service.create({
          userId,
          provider: ProviderCode.telegram,
          externalTargetId: "chat-1",
          targetType: "chat",
        }),
      { statusCode: 400, code: "BAD_REQUEST", message: "No matching connection for target type" },
    );
  });

  it("creates targets with normalized fields and rejects active duplicates", async () => {
    const createdTarget = buildTarget({ displayName: "Chat alerts", metadata: { env: "test" } });
    const { service, targets } = createTargetService({ createdTarget });

    await expect(
      service.create({
        userId,
        provider: ProviderCode.telegram,
        externalTargetId: "chat-123",
        targetType: "chat",
        displayName: "Chat alerts",
        metadata: { env: "test" },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: telegramTargetId,
        provider: ProviderCode.telegram,
        externalTargetId: "chat-123",
        targetType: "chat",
        displayName: "Chat alerts",
        metadata: { env: "test" },
      }),
    );
    expect(targets.create).toHaveBeenCalledWith({
      userId,
      providerId,
      providerConnectionId: connectionId,
      externalTargetId: "chat-123",
      targetType: "chat",
      displayName: "Chat alerts",
      metadata: { env: "test" },
    });

    const duplicate = createTargetService({ duplicate: buildTarget() });
    await expectAppError(
      () =>
        duplicate.service.create({
          userId,
          provider: ProviderCode.telegram,
          externalTargetId: "chat-123",
          targetType: "chat",
        }),
      { statusCode: 409, code: "CONFLICT", message: "Notification target already exists" },
    );
  });

  it("allows updating displayName and metadata fields", async () => {
    const { service, targets } = createTargetService();

    await expect(
      service.update({
        userId,
        targetId: telegramTargetId,
        displayName: "Renamed",
        metadata: { muted: true },
      }),
    ).resolves.toEqual(expect.objectContaining({ displayName: "Renamed", metadata: { muted: true } }));
    expect(targets.updateForUser).toHaveBeenCalledWith(userId, telegramTargetId, {
      displayName: "Renamed",
      metadata: { muted: true },
    });
  });

  it("hides missing targets and rejects duplicate reactivation", async () => {
    const missing = createTargetService({ existing: null });
    await expectAppError(
      () => missing.service.update({ userId, targetId: telegramTargetId, displayName: "Missing" }),
      { statusCode: 404, code: "NOT_FOUND", message: "Notification target not found" },
    );

    const duplicate = createTargetService({ existing: buildTarget({ active: false }), duplicate: buildTarget() });
    await expectAppError(
      () => duplicate.service.activate(userId, telegramTargetId),
      { statusCode: 409, code: "CONFLICT", message: "Notification target already exists" },
    );

    const { service, targets } = createTargetService({ existing: buildTarget({ active: false }) });
    await expect(service.activate(userId, telegramTargetId)).resolves.toEqual(expect.objectContaining({ isActive: true }));
    await expect(service.deactivate(userId, telegramTargetId)).resolves.toEqual(expect.objectContaining({ isActive: false }));
    expect(targets.setActiveForUser).toHaveBeenCalledWith(userId, telegramTargetId, true);
    expect(targets.setActiveForUser).toHaveBeenCalledWith(userId, telegramTargetId, false);
  });
});
