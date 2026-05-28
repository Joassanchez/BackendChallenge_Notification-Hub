import type { Request, Response } from "express";
import type { ProviderService } from "./provider.service.js";

export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  readonly listActiveProviders = async (_request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.providerService.listActiveProviders());
  };
}
