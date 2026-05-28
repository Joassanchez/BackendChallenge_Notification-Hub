import type { Request, Response } from "express";
import type { AdminReportingService } from "./admin-reporting.service.js";

export class AdminReportingController {
  constructor(private readonly adminReportingService: AdminReportingService) {}

  readonly listMessages = async (request: Request, response: Response): Promise<void> => {
    const messages = await this.adminReportingService.listMessages(readQueryRecord(request.query));

    response.status(200).json({ messages });
  };
}

function readQueryRecord(query: Request["query"]): Record<string, unknown> {
  return query as Record<string, unknown>;
}
