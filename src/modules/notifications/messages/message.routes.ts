import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { MessageService } from "./message.service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function createMessageRouter(messageService: MessageService): Router {
  const router = createRouter();

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const idempotencyKey = request.header("Idempotency-Key") ?? undefined;
      const result = await messageService.create({
        userId: auth.id,
        content: readBodyRecord(request.body).content,
        destinations: readBodyRecord(request.body).destinations,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });

      response.status(result.created ? 201 : 200).json(result.message);
    }),
  );

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const messages = await messageService.list({
        userId: auth.id,
        status: readQueryParam(request.query.status),
        provider: readQueryParam(request.query.provider),
        from: readQueryParam(request.query.from),
        to: readQueryParam(request.query.to),
      });

      response.status(200).json({ messages });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (request, response) => {
      const auth = requireAuth(request);
      const message = await messageService.getById(auth.id, readRouteParam(request.params.id));

      response.status(200).json(message);
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

function readBodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

function readQueryParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function readRouteParam(value: unknown): string {
  return typeof value === "string" ? value : "";
}
