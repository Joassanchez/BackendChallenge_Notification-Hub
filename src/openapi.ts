export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Notification Hub API",
    version: "1.0.0",
    description: "API for authentication, notification targets, providers, messages, rate limits, and admin reporting.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Providers" },
    { name: "Notification Targets" },
    { name: "Messages" },
    { name: "Rate Limit" },
    { name: "Admin" },
    { name: "Webhooks" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check API health",
        security: [],
        responses: {
          "200": {
            description: "API is healthy",
            content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
          },
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a user",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
        },
        responses: {
          "201": { description: "User registered", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with username or email",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
        },
        responses: {
          "200": { description: "Bearer token issued", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: {
          "200": { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/providers": {
      get: {
        tags: ["Providers"],
        summary: "List active providers",
        responses: {
          "200": { description: "Active providers", content: { "application/json": { schema: { $ref: "#/components/schemas/ProviderList" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/notification-targets": {
      get: {
        tags: ["Notification Targets"],
        summary: "List notification targets",
        responses: {
          "200": { description: "Notification targets", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTargetList" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Notification Targets"],
        summary: "Create a notification target",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateNotificationTargetRequest" } } },
        },
        responses: {
          "201": { description: "Notification target created", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/notification-targets/{id}": {
      patch: {
        tags: ["Notification Targets"],
        summary: "Update a notification target",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateNotificationTargetRequest" } } },
        },
        responses: {
          "200": { description: "Notification target updated", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/notification-targets/{id}/activate": {
      patch: {
        tags: ["Notification Targets"],
        summary: "Activate a notification target",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "Notification target activated", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/notification-targets/{id}/deactivate": {
      patch: {
        tags: ["Notification Targets"],
        summary: "Deactivate a notification target",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "Notification target deactivated", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/messages": {
      get: {
        tags: ["Messages"],
        summary: "List messages for the authenticated user",
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/MessageStatus" } },
          { name: "provider", in: "query", schema: { $ref: "#/components/schemas/ProviderCode" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": { description: "Messages", content: { "application/json": { schema: { $ref: "#/components/schemas/MessageList" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Messages"],
        summary: "Create and dispatch a message",
        parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateMessageRequest" } } },
        },
        responses: {
          "201": { description: "Message created", content: { "application/json": { schema: { $ref: "#/components/schemas/Message" } } } },
          "200": { description: "Idempotent replay", content: { "application/json": { schema: { $ref: "#/components/schemas/Message" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
          "429": { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    },
    "/messages/{id}": {
      get: {
        tags: ["Messages"],
        summary: "Get a message by id",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          "200": { description: "Message", content: { "application/json": { schema: { $ref: "#/components/schemas/Message" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/rate-limit/me": {
      get: {
        tags: ["Rate Limit"],
        summary: "Get current user's daily rate limit report",
        responses: {
          "200": { description: "Rate limit report", content: { "application/json": { schema: { $ref: "#/components/schemas/RateLimitReport" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/admin/auth-check": {
      get: {
        tags: ["Admin"],
        summary: "Check admin authorization",
        responses: {
          "200": { description: "Admin authorized", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminAuthCheck" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/admin/provider-connections": {
      get: {
        tags: ["Admin"],
        summary: "List provider connections",
        responses: {
          "200": { description: "Provider connections", content: { "application/json": { schema: { $ref: "#/components/schemas/ProviderConnectionList" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/admin/messages": {
      get: {
        tags: ["Admin"],
        summary: "List messages across users",
        parameters: [
          { name: "userId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/MessageStatus" } },
          { name: "provider", in: "query", schema: { $ref: "#/components/schemas/ProviderCode" } },
          { name: "from", in: "query", schema: { type: "string", description: "Date or date-time with timezone" } },
          { name: "to", in: "query", schema: { type: "string", description: "Date or date-time with timezone" } },
        ],
        responses: {
          "200": { description: "Admin messages", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminMessageList" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/admin/metrics": {
      get: {
        tags: ["Admin"],
        summary: "List per-user usage metrics",
        responses: {
          "200": { description: "Admin metrics", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminMetricsList" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/notification-targets/connect-code": {
      post: {
        tags: ["Notification Targets"],
        summary: "Request a connect code for linking a bot chat",
        description: "Generates a single-use code to link your Telegram or Discord bot chat. Send the code to the bot to auto-create a notification target.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectCodeRequest" } } },
        },
        responses: {
          "201": { description: "Connect code generated", content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectCodeResponse" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/webhooks/telegram": {
      post: {
        tags: ["Webhooks"],
        summary: "Telegram bot webhook receiver",
        description: "Receives Telegram bot updates. Requires X-Telegram-Bot-Api-Secret-Token header for authentication.",
        security: [],
        parameters: [
          { name: "X-Telegram-Bot-Api-Secret-Token", in: "header", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TelegramUpdate" } } },
        },
        responses: {
          "200": { description: "Update processed" },
          "403": { description: "Invalid secret token" },
          "400": { description: "Invalid payload" },
        },
      },
    },
    "/webhooks/discord": {
      post: {
        tags: ["Webhooks"],
        summary: "Discord interactions webhook receiver",
        description: "Receives Discord interaction events. Requires Ed25519 signature verification via X-Signature-Ed25519 and X-Signature-Timestamp headers.",
        security: [],
        parameters: [
          { name: "X-Signature-Ed25519", in: "header", required: true, schema: { type: "string" } },
          { name: "X-Signature-Timestamp", in: "header", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DiscordInteraction" } } },
        },
        responses: {
          "200": { description: "Interaction processed" },
          "401": { description: "Invalid signature" },
          "400": { description: "Invalid payload" },
        },
      },
    },
    "/providers/telegram/setup-webhook": {
      post: {
        tags: ["Providers"],
        summary: "Register Telegram webhook URL",
        description: "Admin only. Registers the webhook URL with Telegram's Bot API.",
        security: [{ bearerAuth: [] }],
        "x-admin-required": true,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TelegramSetupWebhookRequest" } } },
        },
        responses: {
          "200": { description: "Webhook registered successfully" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "502": { description: "Telegram API returned an error" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    parameters: {
      Id: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    },
    responses: {
      BadRequest: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Unauthorized: { description: "Authentication is required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Forbidden: { description: "Insufficient permissions", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      NotFound: { description: "Resource not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Conflict: { description: "Resource conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      TooManyRequests: { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      ValidationError: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
    schemas: {
      ProviderCode: { type: "string", enum: ["telegram", "discord", "slack", "teams"] },
      MessageStatus: { type: "string", enum: ["pending", "success", "partial", "failed", "cancelled"] },
      DeliveryStatus: { type: "string", enum: ["pending", "processing", "success", "failed", "retrying", "cancelled"] },
      HealthResponse: { type: "object", required: ["status"], properties: { status: { type: "string", example: "ok" } } },
      AdminAuthCheck: { type: "object", required: ["status"], properties: { status: { type: "string", example: "authorized" } } },
      ErrorResponse: {
        type: "object",
        required: ["error", "message"],
        properties: { error: { type: "string" }, message: { type: "string" }, details: {} },
      },
      User: {
        type: "object",
        required: ["id", "username", "roles"],
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
          email: { type: "string", format: "email", nullable: true },
          roles: { type: "array", items: { type: "string", enum: ["USER", "ADMIN"] } },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["username", "password"],
        properties: { username: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", format: "password" } },
      },
      LoginRequest: {
        type: "object",
        required: ["identifier", "password"],
        properties: {
          identifier: { type: "string", description: "Username or email. The API also accepts username or email fields." },
          password: { type: "string", format: "password" },
        },
      },
      LoginResponse: {
        type: "object",
        required: ["accessToken", "tokenType"],
        properties: { accessToken: { type: "string" }, tokenType: { type: "string", enum: ["Bearer"] } },
      },
      ProviderList: {
        type: "object",
        required: ["providers"],
        properties: { providers: { type: "array", items: { $ref: "#/components/schemas/Provider" } } },
      },
      Provider: {
        type: "object",
        required: ["code", "name"],
        properties: { code: { $ref: "#/components/schemas/ProviderCode" }, name: { type: "string" } },
      },
      ProviderConnectionList: {
        type: "object",
        required: ["providerConnections"],
        properties: { providerConnections: { type: "array", items: { $ref: "#/components/schemas/ProviderConnection" } } },
      },
      ProviderConnection: {
        type: "object",
        required: ["id", "providerCode", "name", "authType", "isActive", "maskedSecretRef", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          providerCode: { $ref: "#/components/schemas/ProviderCode" },
          name: { type: "string" },
          authType: { type: "string" },
          config: { type: "object", nullable: true, additionalProperties: true },
          isActive: { type: "boolean" },
          maskedSecretRef: { type: "string", nullable: true, enum: ["***", null] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      NotificationTargetList: {
        type: "object",
        required: ["targets"],
        properties: { targets: { type: "array", items: { $ref: "#/components/schemas/NotificationTarget" } } },
      },
      NotificationTarget: {
        type: "object",
        required: ["id", "provider", "externalTargetId", "targetType", "displayName", "metadata", "isActive", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          provider: { $ref: "#/components/schemas/ProviderCode" },
          externalTargetId: { type: "string" },
          targetType: { type: "string", example: "chat" },
          displayName: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateNotificationTargetRequest: {
        type: "object",
        required: ["provider", "externalTargetId", "targetType"],
        properties: {
          provider: { $ref: "#/components/schemas/ProviderCode" },
          externalTargetId: { type: "string" },
          targetType: { type: "string", description: "telegram uses chat; discord uses webhook." },
          displayName: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
        },
      },
      UpdateNotificationTargetRequest: {
        type: "object",
        properties: {
          displayName: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
        },
      },
      CreateMessageRequest: {
        type: "object",
        required: ["content", "destinations"],
        properties: {
          content: { type: "string" },
          destinations: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/MessageDestination" } },
        },
      },
      MessageDestination: {
        type: "object",
        required: ["provider", "targetId"],
        properties: { provider: { $ref: "#/components/schemas/ProviderCode" }, targetId: { type: "string", format: "uuid" } },
      },
      MessageList: {
        type: "object",
        required: ["messages"],
        properties: { messages: { type: "array", items: { $ref: "#/components/schemas/Message" } } },
      },
      Message: {
        type: "object",
        required: ["id", "messageId", "content", "status", "createdAt", "updatedAt", "deliveries"],
        properties: {
          id: { type: "string", format: "uuid" },
          messageId: { type: "string", format: "uuid" },
          content: { type: "string" },
          status: { $ref: "#/components/schemas/MessageStatus" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deliveries: { type: "array", items: { $ref: "#/components/schemas/MessageDelivery" } },
        },
      },
      MessageDelivery: {
        type: "object",
        required: ["id", "provider", "targetId", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          provider: { $ref: "#/components/schemas/ProviderCode" },
          targetId: { type: "string", format: "uuid" },
          status: { $ref: "#/components/schemas/DeliveryStatus" },
        },
      },
      RateLimitReport: {
        type: "object",
        required: ["usageDate", "dailyLimit", "usedToday", "remainingToday"],
        properties: {
          usageDate: { type: "string", format: "date" },
          dailyLimit: { type: "integer" },
          usedToday: { type: "integer" },
          remainingToday: { type: "integer" },
        },
      },
      AdminMessageList: {
        type: "object",
        required: ["messages"],
        properties: { messages: { type: "array", items: { $ref: "#/components/schemas/AdminMessage" } } },
      },
      AdminMessage: {
        allOf: [
          { $ref: "#/components/schemas/Message" },
          {
            type: "object",
            required: ["userId"],
            properties: {
              userId: { type: "string", format: "uuid" },
              deliveries: { type: "array", items: { $ref: "#/components/schemas/AdminMessageDelivery" } },
            },
          },
        ],
      },
      AdminMessageDelivery: {
        type: "object",
        required: ["id", "provider", "targetType", "externalTargetId", "status", "attemptsCount"],
        properties: {
          id: { type: "string", format: "uuid" },
          provider: { $ref: "#/components/schemas/ProviderCode" },
          targetType: { type: "string" },
          externalTargetId: { type: "string" },
          status: { $ref: "#/components/schemas/DeliveryStatus" },
          attemptsCount: { type: "integer" },
        },
      },
      AdminMetricsList: {
        type: "object",
        required: ["metrics"],
        properties: { metrics: { type: "array", items: { $ref: "#/components/schemas/AdminMetrics" } } },
      },
      AdminMetrics: {
        type: "object",
        required: ["userId", "email", "username", "totalMessagesSent", "sentToday", "dailyLimit", "remainingToday"],
        properties: {
          userId: { type: "string", format: "uuid" },
          email: { type: "string", format: "email", nullable: true },
          username: { type: "string" },
          totalMessagesSent: { type: "integer" },
          sentToday: { type: "integer" },
          dailyLimit: { type: "integer" },
          remainingToday: { type: "integer" },
        },
      },
      ConnectCodeRequest: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { $ref: "#/components/schemas/ProviderCode" },
        },
      },
      ConnectCodeResponse: {
        type: "object",
        required: ["code", "expiresAt", "connectUrl"],
        properties: {
          code: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          connectUrl: { type: "string" },
        },
      },
      TelegramSetupWebhookRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
        },
      },
      TelegramUpdate: {
        type: "object",
        properties: {
          update_id: { type: "integer" },
          message: {
            type: "object",
            properties: {
              message_id: { type: "integer" },
              text: { type: "string" },
              chat: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                },
              },
            },
          },
        },
      },
      DiscordInteraction: {
        type: "object",
        properties: {
          type: { type: "integer" },
          data: {
            type: "object",
            properties: {
              name: { type: "string" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    value: { type: "string" },
                  },
                },
              },
            },
          },
          channel_id: { type: "string" },
          token: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
} as const;
