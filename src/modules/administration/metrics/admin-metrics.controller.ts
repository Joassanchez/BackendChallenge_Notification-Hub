import type { Request, Response } from "express";
import type { AdminMetricsService } from "./admin-metrics.service.js";
import { validateQuery } from "../../../shared/http/validation-wrapper.js";
import { getMetricsQuerySchema } from "./admin-metrics.schemas.js";

export class AdminMetricsController {
  constructor(private readonly adminMetricsService: AdminMetricsService) {}

  readonly getMetrics = async (request: Request, response: Response): Promise<void> => {
    validateQuery(getMetricsQuerySchema, request.query, { mode: "bad-request" });
    const metrics = await this.adminMetricsService.getMetrics();

    response.status(200).json({ metrics });
  };
}
