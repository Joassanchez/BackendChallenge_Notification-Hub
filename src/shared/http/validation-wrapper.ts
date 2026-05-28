import { type ZodSchema, ZodError } from "zod";
import { badRequest, unprocessable } from "./errors.js";

export type ValidationOptions = {
  mode: "bad-request" | "validation-error";
  message?: string;
  details?: Record<string, unknown> | Array<unknown>;
};

export function validateBody<T>(schema: ZodSchema<T>, body: unknown, options: ValidationOptions): T {
  return runValidation(schema, body, options);
}

export function validateQuery<T>(schema: ZodSchema<T>, query: unknown, options: ValidationOptions): T {
  return runValidation(schema, query, options);
}

export function validateParams<T>(schema: ZodSchema<T>, params: unknown, options: ValidationOptions): T {
  return runValidation(schema, params, options);
}

export function validateHeaders<T>(schema: ZodSchema<T>, headers: unknown, options: ValidationOptions): T {
  return runValidation(schema, headers, options);
}

function runValidation<T>(schema: ZodSchema<T>, input: unknown, options: ValidationOptions): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw mapZodToAppError(result.error, options);
}

function mapZodToAppError(error: ZodError, options: ValidationOptions): never {
  if (options.mode === "bad-request") {
    const message = options.message ?? error.issues[0]?.message ?? "Bad request";
    throw badRequest(message, options.details);
  }

  // validation-error mode
  const message = options.message ?? "Validation failed";
  const details = options.details ?? { errors: error.issues.map((i) => i.message) };
  throw unprocessable(message, details);
}
