import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";

const providerConnectionWithProvider = {
  provider: true,
} as const;

export type ProviderConnectionWithProvider = Prisma.ProviderConnectionGetPayload<{
  include: typeof providerConnectionWithProvider;
}>;

export class ProviderConnectionRepository {
  constructor(private readonly db: PrismaClient) {}

  findProviderConnectionsForAdmin() {
    return this.db.providerConnection.findMany({
      include: providerConnectionWithProvider,
      orderBy: {
        createdAt: "asc",
      },
    });
  }
}