export type ErrorDetails = Record<string, unknown> | Array<unknown>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ErrorDetails | undefined;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: ErrorDetails): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Insufficient permissions"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function conflict(message: string, details?: ErrorDetails): AppError {
  return new AppError(409, "CONFLICT", message, details);
}

export function unprocessable(message: string, details?: ErrorDetails): AppError {
  return new AppError(422, "VALIDATION_ERROR", message, details);
}
