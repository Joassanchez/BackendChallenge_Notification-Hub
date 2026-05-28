import type { Request, Response } from "express";
import type { AdminReportingMessageFilters } from "./admin-reporting.repository.js";
import type { AdminReportingService } from "./admin-reporting.service.js";
import { validateQuery } from "../../../shared/http/validation-wrapper.js";
import { listMessagesQuerySchema } from "./admin-reporting.schemas.js";
import { MessageStatus, ProviderCode } from "../../../generated/prisma/client.js";

export class AdminReportingController {
  constructor(private readonly adminReportingService: AdminReportingService) {}

  readonly listMessages = async (request: Request, response: Response): Promise<void> => {
    const validated = validateQuery(listMessagesQuerySchema, request.query, { mode: "bad-request" });

    const filters: AdminReportingMessageFilters = {
      ...(validated.userId !== undefined ? { userId: validated.userId } : {}),
      ...(validated.status !== undefined ? { status: validated.status as MessageStatus } : {}),
      ...(validated.provider !== undefined ? { provider: validated.provider as ProviderCode } : {}),
      ...(validated.from !== undefined ? { from: new Date(validated.from) } : {}),
      ...(validated.to !== undefined ? { to: new Date(validated.to) } : {}),
    };

    const messages = await this.adminReportingService.listMessages(filters);

    response.status(200).json({ messages });
  };
}
