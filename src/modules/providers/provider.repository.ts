import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

const providerConnectionWithProvider = {
  provider: true,
} as const;

export type ProviderConnectionWithProvider = Prisma.ProviderConnectionGetPayload<{
  include: typeof providerConnectionWithProvider;
}>;

export class ProviderRepository {
  constructor(private readonly db: PrismaClient) {}

  findActiveProviders() {
    return this.db.provider.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        code: "asc",
      },
    });
  }

  findProviderConnectionsForAdmin() {
    return this.db.providerConnection.findMany({
      include: providerConnectionWithProvider,
      orderBy: {
        createdAt: "asc",
      },
    });
  }
}
