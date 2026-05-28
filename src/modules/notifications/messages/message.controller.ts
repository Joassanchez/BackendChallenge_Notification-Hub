import type { Request, Response } from "express";
import { MessageStatus, ProviderCode } from "../../../generated/prisma/client.js";
import { unauthorized } from "../../../shared/http/errors.js";
import { validateBody, validateHeaders, validateParams, validateQuery } from "../../../shared/http/validation-wrapper.js";
import type { NormalizedDestination } from "./message-repository.js";
import type { MessageService } from "./message.service.js";
import {
  createMessageBodySchema,
  idempotencyKeyHeaderSchema,
  listMessagesQuerySchema,
  messageIdParamsSchema,
} from "./message.schemas.js";

const badRequestMode = { mode: "bad-request" } as const;

export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  readonly create = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const body = validateBody(createMessageBodySchema, request.body, badRequestMode);
    const headers = validateHeaders(idempotencyKeyHeaderSchema, request.headers, badRequestMode);
    const idempotencyKey = headers["idempotency-key"] ?? undefined;
    const result = await this.messageService.create({
      userId: auth.id,
      content: body.content.trim(),
      destinations: body.destinations.map(
        (d): NormalizedDestination => ({ provider: d.provider as ProviderCode, targetId: d.targetId }),
      ),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey: idempotencyKey.trim() }),
    });

    response.status(result.created ? 201 : 200).json(result.message);
  };

  readonly list = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const query = validateQuery(listMessagesQuerySchema, request.query, badRequestMode);
    const messages = await this.messageService.list({
      userId: auth.id,
      ...(query.status === undefined ? {} : { status: query.status as MessageStatus }),
      ...(query.provider === undefined ? {} : { provider: query.provider as ProviderCode }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    });

    response.status(200).json({ messages });
  };

  readonly getById = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const { id: messageId } = validateParams(messageIdParamsSchema, { id: request.params.id }, badRequestMode);
    const message = await this.messageService.getById(auth.id, messageId);

    response.status(200).json(message);
  };
}

function requireAuth(request: Request) {
  if (request.auth === undefined) {
    throw unauthorized();
  }

  return request.auth;
}
