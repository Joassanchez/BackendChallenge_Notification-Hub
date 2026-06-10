import type { Request, Response } from "express";
import { Prisma, ProviderCode } from "../../../generated/prisma/client.js";
import { unauthorized } from "../../../shared/http/errors.js";
import { validateBody, validateParams } from "../../../shared/http/validation-wrapper.js";
import type { ConnectCodeService } from "../../provider-webhooks/connect-code/connect-code.service.js";
import { connectCodeBodySchema } from "../../provider-webhooks/connect-code/connect-code.schemas.js";
import type { NotificationTargetService } from "./notification-target.service.js";
import {
  createTargetBodySchema,
  updateTargetBodySchema,
  targetIdParamsSchema,
} from "./notification-target.schemas.js";

const badRequestMode = { mode: "bad-request" } as const;

export class NotificationTargetController {
  constructor(
    private readonly notificationTargetService: NotificationTargetService,
    private readonly connectCodeService?: ConnectCodeService,
  ) {}

  readonly list = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);

    response.status(200).json(await this.notificationTargetService.list(auth.id));
  };

  readonly create = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const body = validateBody(createTargetBodySchema, request.body, badRequestMode);
    const input: Parameters<NotificationTargetService["create"]>[0] = {
      userId: auth.id,
      provider: body.provider as ProviderCode,
      targetType: body.targetType,
      externalTargetId: body.externalTargetId.trim(),
    };
    if (body.displayName !== undefined) {
      input.displayName = body.displayName;
    }
    if (body.metadata !== undefined) {
      input.metadata = normalizeMetadata(body.metadata);
    }
    const target = await this.notificationTargetService.create(input);

    response.status(201).json(target);
  };

  readonly update = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const { id: targetId } = validateParams(targetIdParamsSchema, { id: request.params.id }, badRequestMode);
    const body = validateBody(updateTargetBodySchema, request.body, badRequestMode);
    const input: Parameters<NotificationTargetService["update"]>[0] = {
      userId: auth.id,
      targetId,
    };
    if (body.displayName !== undefined) {
      input.displayName = body.displayName;
    }
    if (body.metadata !== undefined) {
      input.metadata = normalizeMetadata(body.metadata);
    }
    const target = await this.notificationTargetService.update(input);

    response.status(200).json(target);
  };

  readonly activate = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const { id: targetId } = validateParams(targetIdParamsSchema, { id: request.params.id }, badRequestMode);
    const target = await this.notificationTargetService.activate(auth.id, targetId);

    response.status(200).json(target);
  };

  readonly deactivate = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const { id: targetId } = validateParams(targetIdParamsSchema, { id: request.params.id }, badRequestMode);
    const target = await this.notificationTargetService.deactivate(auth.id, targetId);

    response.status(200).json(target);
  };

  readonly connectCode = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);

    if (!this.connectCodeService) {
      response.status(501).json({ error: "Connect codes not available" });
      return;
    }

    const body = validateBody(connectCodeBodySchema, request.body, badRequestMode);
    const result = this.connectCodeService.generate(auth.id, body.provider);

    response.status(201).json(result);
  };
}

function requireAuth(request: Request) {
  if (request.auth === undefined) {
    throw unauthorized();
  }

  return request.auth;
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
