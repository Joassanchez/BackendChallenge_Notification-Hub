import type { Request, Response } from "express";
import type { ProviderConnectionService } from "./provider-connection.service.js";

export class ProviderConnectionController {
  constructor(private readonly providerConnectionService: ProviderConnectionService) {}

  readonly listProviderConnectionsForAdmin = async (_request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.providerConnectionService.listProviderConnectionsForAdmin());
  };
}
