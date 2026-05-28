import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ProviderConnectionService } from "./provider-connection.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createAdminProviderConnectionRouter(providerConnectionService: ProviderConnectionService): Router {
  const router = createRouter();

  router.get(
    "/",
    asyncHandler(async (_request, response) => {
      response.status(200).json(await providerConnectionService.listProviderConnectionsForAdmin());
    }),
  );

  return router;
}