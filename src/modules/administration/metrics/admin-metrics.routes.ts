import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AdminMetricsService } from "./admin-metrics.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createAdminMetricsRouter(adminMetricsService: AdminMetricsService): Router {
  const router = createRouter();

  router.get(
    "/metrics",
    asyncHandler(async (request, response) => {
      const metrics = await adminMetricsService.getMetrics(readQueryRecord(request.query));

      response.status(200).json({ metrics });
    }),
  );

  return router;
}

function readQueryRecord(query: Request["query"]): Record<string, unknown> {
  return query as Record<string, unknown>;
}
