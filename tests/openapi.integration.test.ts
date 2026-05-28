import request from "supertest";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://notification_user:notification_password@localhost:5432/notification_hub_db?schema=public";
process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRES_IN = "1d";
process.env.PORT = "3001";

const { createApp } = await import("../src/app.js");

const app = createApp();

describe("OpenAPI documentation", () => {
  it("serves the OpenAPI document", async () => {
    const response = await request(app).get("/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info.title).toBe("Notification Hub API");
    expect(response.body.paths).toHaveProperty("/auth/login");
    expect(response.body.paths).toHaveProperty("/messages");
    expect(response.body.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("serves Swagger UI", async () => {
    const response = await request(app).get("/docs/").expect(200);

    expect(response.text).toContain("Swagger UI");
  });
});
