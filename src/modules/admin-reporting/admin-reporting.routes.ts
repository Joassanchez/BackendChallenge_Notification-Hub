import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AdminReportingService } from "./admin-reporting.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createAdminReportingRouter(adminReportingService: AdminReportingService): Router {
  const router = createRouter();

  router.get(
    "/messages",
    asyncHandler(async (request, response) => {
      const messages = await adminReportingService.listMessages(readQueryRecord(request.query));

      response.status(200).json({ messages });
    }),
  );

  router.get(
    "/metrics",
    asyncHandler(async (request, response) => {
      const metrics = await adminReportingService.getMetrics(readQueryRecord(request.query));

      response.status(200).json({ metrics });
    }),
  );

  return router;
}

function readQueryRecord(query: Request["query"]): Record<string, unknown> {
  return query as Record<string, unknown>;
}
