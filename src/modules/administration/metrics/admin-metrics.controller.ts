import type { Request, Response } from "express";
import type { AdminMetricsService } from "./admin-metrics.service.js";

export class AdminMetricsController {
  constructor(private readonly adminMetricsService: AdminMetricsService) {}

  readonly getMetrics = async (request: Request, response: Response): Promise<void> => {
    const metrics = await this.adminMetricsService.getMetrics(readQueryRecord(request.query));

    response.status(200).json({ metrics });
  };
}

function readQueryRecord(query: Request["query"]): Record<string, unknown> {
  return query as Record<string, unknown>;
}
