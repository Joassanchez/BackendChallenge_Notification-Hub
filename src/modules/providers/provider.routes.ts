import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ProviderService } from "./provider.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createProviderRouter(providerService: ProviderService): Router {
  const router = createRouter();

  router.get(
    "/",
    asyncHandler(async (_request, response) => {
      response.status(200).json(await providerService.listActiveProviders());
    }),
  );

  return router;
}

export function createAdminProviderConnectionRouter(providerService: ProviderService): Router {
  const router = createRouter();

  router.get(
    "/",
    asyncHandler(async (_request, response) => {
      response.status(200).json(await providerService.listProviderConnectionsForAdmin());
    }),
  );

  return router;
}
