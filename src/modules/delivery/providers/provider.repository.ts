import type { PrismaClient } from "../../../generated/prisma/client.js";

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
}