import type { ProviderCode } from "../../../generated/prisma/client.js";
import type { ProviderRepository } from "./provider.repository.js";

export type ProviderDto = {
  code: ProviderCode;
  name: string;
};

export class ProviderService {
  constructor(private readonly providers: ProviderRepository) {}

  async listActiveProviders(): Promise<{ providers: ProviderDto[] }> {
    const providers = await this.providers.findActiveProviders();

    return {
      providers: providers.map((provider) => ({
        code: provider.code,
        name: provider.name,
      })),
    };
  }
}