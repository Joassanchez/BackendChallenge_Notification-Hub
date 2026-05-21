import type { ErrorRequestHandler } from "express";
import { AppError } from "./errors.js";

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error",
  });
};
