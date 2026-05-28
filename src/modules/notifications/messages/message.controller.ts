import type { Request, Response } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { MessageService } from "./message.service.js";

export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  readonly create = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const body = readBodyRecord(request.body);
    const idempotencyKey = request.header("Idempotency-Key") ?? undefined;
    const result = await this.messageService.create({
      userId: auth.id,
      content: body.content,
      destinations: body.destinations,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });

    response.status(result.created ? 201 : 200).json(result.message);
  };

  readonly list = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const messages = await this.messageService.list({
      userId: auth.id,
      status: readQueryParam(request.query.status),
      provider: readQueryParam(request.query.provider),
      from: readQueryParam(request.query.from),
      to: readQueryParam(request.query.to),
    });

    response.status(200).json({ messages });
  };

  readonly getById = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const message = await this.messageService.getById(auth.id, readRouteParam(request.params.id));

    response.status(200).json(message);
  };
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
