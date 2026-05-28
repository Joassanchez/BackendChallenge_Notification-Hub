import type { Request, Response } from "express";
import { unauthorized } from "../../../shared/http/errors.js";
import type { NotificationTargetService } from "./notification-target.service.js";

export class NotificationTargetController {
  constructor(private readonly notificationTargetService: NotificationTargetService) {}

  readonly list = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);

    response.status(200).json(await this.notificationTargetService.list(auth.id));
  };

  readonly create = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const target = await this.notificationTargetService.create({
      userId: auth.id,
      body: request.body,
    });

    response.status(201).json(target);
  };

  readonly update = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const target = await this.notificationTargetService.update({
      userId: auth.id,
      targetId: readRouteParam(request.params.id),
      body: request.body,
    });

    response.status(200).json(target);
  };

  readonly activate = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const target = await this.notificationTargetService.activate(auth.id, readRouteParam(request.params.id));

    response.status(200).json(target);
  };

  readonly deactivate = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuth(request);
    const target = await this.notificationTargetService.deactivate(auth.id, readRouteParam(request.params.id));

    response.status(200).json(target);
  };
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
