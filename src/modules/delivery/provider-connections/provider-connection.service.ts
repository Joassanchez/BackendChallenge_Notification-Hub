import type { Prisma, ProviderCode } from "../../../generated/prisma/client.js";
import type { ProviderConnectionRepository, ProviderConnectionWithProvider } from "./provider-connection.repository.js";

export type ProviderConnectionAdminDto = {
  id: string;
  providerCode: ProviderCode;
  name: string;
  authType: string;
  config: Prisma.JsonValue | null;
  isActive: boolean;
  maskedSecretRef: "***" | null;
  createdAt: string;
  updatedAt: string;
};

export class ProviderConnectionService {
  constructor(private readonly providerConnections: ProviderConnectionRepository) {}

  async listProviderConnectionsForAdmin(): Promise<{ providerConnections: ProviderConnectionAdminDto[] }> {
    const connections = await this.providerConnections.findProviderConnectionsForAdmin();

    return {
      providerConnections: connections.map(toProviderConnectionAdminDto),
    };
  }
}

function toProviderConnectionAdminDto(connection: ProviderConnectionWithProvider): ProviderConnectionAdminDto {
  return {
    id: connection.id,
    providerCode: connection.provider.code,
    name: connection.name,
    authType: connection.authType,
    config: connection.config,
    isActive: connection.isActive,
    maskedSecretRef: connection.secretRef === null ? null : "***",
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}