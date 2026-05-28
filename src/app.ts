import express from "express";
import * as swaggerUi from "swagger-ui-express";
import { AdminReportingRepository } from "./modules/admin-reporting/admin-reporting.repository.js";
import { createAdminReportingRouter } from "./modules/admin-reporting/admin-reporting.routes.js";
import { AdminReportingService } from "./modules/admin-reporting/admin-reporting.service.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { createAuthenticateMiddleware } from "./modules/auth/authenticate.middleware.js";
import { PasswordService } from "./modules/auth/password.service.js";
import { TokenService } from "./modules/auth/token.service.js";
import { DeliveryConfigResolver } from "./modules/delivery-execution/delivery-config-resolver.js";
import { DeliveryExecutionRepository } from "./modules/delivery-execution/delivery-execution.repository.js";
import { DeliveryExecutionService } from "./modules/delivery-execution/delivery-execution.service.js";
import type { DeliveryProviderRegistry } from "./modules/delivery-execution/delivery-provider-adapter.js";
import { createProductionDeliveryProviderRegistry } from "./modules/delivery-execution/provider-adapters.js";
import { MessageRepository } from "./modules/messages/message-repository.js";
import { createMessageRouter } from "./modules/messages/message.routes.js";
import { MessageService } from "./modules/messages/message.service.js";
import { NotificationTargetRepository } from "./modules/notification-targets/notification-target.repository.js";
import { createNotificationTargetRouter } from "./modules/notification-targets/notification-target.routes.js";
import { NotificationTargetService } from "./modules/notification-targets/notification-target.service.js";
import { ProviderRepository } from "./modules/providers/provider.repository.js";
import { createAdminProviderConnectionRouter, createProviderRouter } from "./modules/providers/provider.routes.js";
import { ProviderService } from "./modules/providers/provider.service.js";
import { RateLimitRepository } from "./modules/rate-limiting/rate-limit.repository.js";
import { createRateLimitRouter } from "./modules/rate-limiting/rate-limit.routes.js";
import { RateLimitService } from "./modules/rate-limiting/rate-limit.service.js";
import { requireRole } from "./modules/roles/require-role.middleware.js";
import { openApiDocument } from "./openapi.js";
import { UserRepository } from "./modules/users/user-repository.js";
import { env } from "./shared/config/env.js";
import { prisma } from "./shared/database/prisma.js";
import { errorMiddleware } from "./shared/http/error-middleware.js";

export type AppDependencies = {
  deliveryAdapters?: DeliveryProviderRegistry;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();

  const userRepository = new UserRepository(prisma);
  const tokenService = new TokenService();
  const authService = new AuthService(userRepository, new PasswordService(), tokenService);
  const authenticate = createAuthenticateMiddleware(tokenService, userRepository);
  const deliveryExecutionService = new DeliveryExecutionService(
    new DeliveryExecutionRepository(prisma),
    new DeliveryConfigResolver(),
    dependencies.deliveryAdapters ?? createProductionDeliveryProviderRegistry(),
  );
  const providerService = new ProviderService(new ProviderRepository(prisma));
  const notificationTargetService = new NotificationTargetService(new NotificationTargetRepository(prisma));
  const rateLimitService = new RateLimitService(new RateLimitRepository(prisma));
  const messageService = new MessageService(new MessageRepository(prisma), deliveryExecutionService, rateLimitService);
  const adminReportingService = new AdminReportingService(new AdminReportingRepository(prisma), env.DAILY_MESSAGE_LIMIT);

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/openapi.json", (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/auth", createAuthRouter(authService));
  app.use("/providers", authenticate, createProviderRouter(providerService));
  app.use("/admin/provider-connections", authenticate, requireRole("ADMIN"), createAdminProviderConnectionRouter(providerService));
  app.use("/notification-targets", authenticate, createNotificationTargetRouter(notificationTargetService));
  app.use("/messages", authenticate, createMessageRouter(messageService));
  app.use("/rate-limit", authenticate, createRateLimitRouter(rateLimitService));
  app.use("/admin", authenticate, requireRole("ADMIN"), createAdminReportingRouter(adminReportingService));

  app.get("/me", authenticate, (request, response) => {
    response.status(200).json(request.auth);
  });

  app.get("/admin/auth-check", authenticate, requireRole("ADMIN"), (_request, response) => {
    response.status(200).json({ status: "authorized" });
  });

  app.use(errorMiddleware);

  return app;
}
