import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../src/shared/http/errors.js";
import {
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  type ValidationOptions,
} from "../src/shared/http/validation-wrapper.js";

const stringSchema = z.string();
const objectSchema = z.object({
  name: z.string().min(1, "name is required"),
  age: z.number().min(0, "age must be positive"),
});

describe("validation-wrapper", () => {
  describe("valid input returns typed data", () => {
    it.each([
      ["validateBody", validateBody],
      ["validateQuery", validateQuery],
      ["validateParams", validateParams],
      ["validateHeaders", validateHeaders],
    ] as const)("%s returns typed data for valid input", (_name, validate) => {
      const result = validate(stringSchema, "hello", { mode: "bad-request" });
      expect(result).toBe("hello");
    });

    it("returns typed object for valid object input", () => {
      const result = validateBody(objectSchema, { name: "Alice", age: 30 }, { mode: "bad-request" });
      expect(result).toEqual({ name: "Alice", age: 30 });
    });
  });

  describe("error mode: bad-request (400)", () => {
    it("throws AppError with status 400 and BAD_REQUEST code", () => {
      try {
        validateBody(stringSchema, 123, { mode: "bad-request" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.statusCode).toBe(400);
        expect(appError.code).toBe("BAD_REQUEST");
      }
    });

    it("uses first Zod issue message as error message", () => {
      try {
        validateBody(objectSchema, { name: "", age: -1 }, { mode: "bad-request" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.message).toBe("name is required");
      }
    });

    it("overrides message via ValidationOptions.message", () => {
      try {
        validateBody(objectSchema, {}, { mode: "bad-request", message: "Custom bad request message" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.message).toBe("Custom bad request message");
      }
    });

    it("has no details by default in bad-request mode", () => {
      try {
        validateBody(stringSchema, 123, { mode: "bad-request" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.details).toBeUndefined();
      }
    });

    it("passes details through in bad-request mode", () => {
      try {
        validateBody(stringSchema, 123, { mode: "bad-request", details: { extra: "info" } });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.details).toEqual({ extra: "info" });
      }
    });
  });

  describe("error mode: validation-error (422)", () => {
    it("throws AppError with status 422 and VALIDATION_ERROR code", () => {
      try {
        validateBody(objectSchema, {}, { mode: "validation-error" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.statusCode).toBe(422);
        expect(appError.code).toBe("VALIDATION_ERROR");
      }
    });

    it("defaults message to 'Validation failed'", () => {
      try {
        validateBody(objectSchema, {}, { mode: "validation-error" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.message).toBe("Validation failed");
      }
    });

    it("overrides message via ValidationOptions.message", () => {
      try {
        validateBody(objectSchema, {}, { mode: "validation-error", message: "Invalid registration payload" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.message).toBe("Invalid registration payload");
      }
    });

    it("collects all issue messages into details.errors array", () => {
      const singleField = z.object({ name: z.string().min(1, "name is required") });

      try {
        validateBody(singleField, { name: "" }, { mode: "validation-error" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.details).toBeDefined();
        expect(appError.details).toEqual({ errors: ["name is required"] });
      }
    });

    it("collects multiple issues correctly", () => {
      try {
        validateBody(objectSchema, { name: "", age: -1 }, { mode: "validation-error" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        const errors = (appError.details as { errors: string[] }).errors;
        expect(errors).toHaveLength(2);
        expect(errors).toContain("name is required");
        expect(errors).toContain("age must be positive");
      }
    });

    it("allows details override via ValidationOptions.details", () => {
      try {
        validateBody(objectSchema, {}, {
          mode: "validation-error",
          details: { errors: ["custom error 1", "custom error 2"] },
        });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.details).toEqual({ errors: ["custom error 1", "custom error 2"] });
      }
    });
  });

  describe("all four validate functions work identically", () => {
    it.each([
      ["validateBody", validateBody],
      ["validateQuery", validateQuery],
      ["validateParams", validateParams],
      ["validateHeaders", validateHeaders],
    ] as const)("%s throws the same error for invalid input", (_name, validate) => {
      try {
        validate(stringSchema, 123, { mode: "bad-request" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.statusCode).toBe(400);
        expect(appError.code).toBe("BAD_REQUEST");
      }
    });
  });
});
