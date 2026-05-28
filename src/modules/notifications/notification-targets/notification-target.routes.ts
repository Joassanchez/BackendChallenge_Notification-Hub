import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { NotificationTargetService } from "./notification-target.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createNotificationTargetRouter(notificationTargetService: NotificationTargetService): Router {
  const router = createRouter();

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);

      response.status(200).json(await notificationTargetService.list(auth.id));
    }),
  );

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const target = await notificationTargetService.create({
        userId: auth.id,
        body: request.body,
      });

      response.status(201).json(target);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const target = await notificationTargetService.update({
        userId: auth.id,
        targetId: readRouteParam(request.params.id),
        body: request.body,
      });

      response.status(200).json(target);
    }),
  );

  router.patch(
    "/:id/activate",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const target = await notificationTargetService.activate(auth.id, readRouteParam(request.params.id));

      response.status(200).json(target);
    }),
  );

  router.patch(
    "/:id/deactivate",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const target = await notificationTargetService.deactivate(auth.id, readRouteParam(request.params.id));

      response.status(200).json(target);
    }),
  );

  return router;
}

function requireAuth(request: Request) {
  if (request.auth === undefined) {
    throw unauthorized();
  }

  return request.auth;
}

function readRouteParam(value: unknown): string {
  return typeof value === "string" ? value : "";
}
