import express from "express";
import * as swaggerUi from "swagger-ui-express";
import { AdminMetricsRepository } from "./modules/administration/metrics/admin-metrics.repository.js";
import { createAdminMetricsRouter } from "./modules/administration/metrics/admin-metrics.routes.js";
import { AdminMetricsService } from "./modules/administration/metrics/admin-metrics.service.js";
import { AdminReportingRepository } from "./modules/administration/reporting/admin-reporting.repository.js";
import { createAdminReportingRouter } from "./modules/administration/reporting/admin-reporting.routes.js";
import { AdminReportingService } from "./modules/administration/reporting/admin-reporting.service.js";
import { createAuthRouter } from "./modules/identity/auth/auth.routes.js";
import { AuthService } from "./modules/identity/auth/auth.service.js";
import { createAuthenticateMiddleware } from "./modules/identity/auth/authenticate.middleware.js";
import { PasswordService } from "./modules/identity/auth/password.service.js";
import { TokenService } from "./modules/identity/auth/token.service.js";
import { DeliveryConfigResolver } from "./modules/delivery/execution/delivery-config-resolver.js";
import { DeliveryExecutionRepository } from "./modules/delivery/execution/delivery-execution.repository.js";
import { DeliveryExecutionService } from "./modules/delivery/execution/delivery-execution.service.js";
import type { DeliveryProviderRegistry } from "./modules/delivery/adapters/delivery-provider-adapter.js";
import { createProductionDeliveryProviderRegistry } from "./modules/delivery/adapters/provider-adapters.js";
import { RetryScheduler } from "./modules/delivery/retry/retry-scheduler.js";
import { recoverStaleProcessing } from "./modules/delivery/retry/stale-recovery.js";
import { MessageRepository } from "./modules/notifications/messages/message-repository.js";
import { createMessageRouter } from "./modules/notifications/messages/message.routes.js";
import { MessageService } from "./modules/notifications/messages/message.service.js";
import { NotificationTargetRepository } from "./modules/notifications/notification-targets/notification-target.repository.js";
import { createNotificationTargetRouter } from "./modules/notifications/notification-targets/notification-target.routes.js";
import { NotificationTargetService } from "./modules/notifications/notification-targets/notification-target.service.js";
import { ProviderConnectionRepository } from "./modules/delivery/provider-connections/provider-connection.repository.js";
import { createAdminProviderConnectionRouter } from "./modules/delivery/provider-connections/provider-connection.routes.js";
import { ProviderConnectionService } from "./modules/delivery/provider-connections/provider-connection.service.js";
import { ProviderRepository } from "./modules/delivery/providers/provider.repository.js";
import { createProviderRouter } from "./modules/delivery/providers/provider.routes.js";
import { ProviderService } from "./modules/delivery/providers/provider.service.js";
import { RateLimitRepository } from "./modules/quota/rate-limiting/rate-limit.repository.js";
import { createRateLimitRouter } from "./modules/quota/rate-limiting/rate-limit.routes.js";
import { RateLimitService } from "./modules/quota/rate-limiting/rate-limit.service.js";
import { requireRole } from "./modules/identity/roles/require-role.middleware.js";
import { openApiDocument } from "./openapi.js";
import { UserRepository } from "./modules/identity/users/user-repository.js";
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
  const deliveryExecutionRepository = new DeliveryExecutionRepository(prisma);
  const deliveryExecutionService = new DeliveryExecutionService(
    deliveryExecutionRepository,
    new DeliveryConfigResolver(),
    dependencies.deliveryAdapters ?? createProductionDeliveryProviderRegistry(),
  );
  const providerService = new ProviderService(new ProviderRepository(prisma));
  const providerConnectionService = new ProviderConnectionService(new ProviderConnectionRepository(prisma));
  const notificationTargetService = new NotificationTargetService(new NotificationTargetRepository(prisma));
  const rateLimitService = new RateLimitService(new RateLimitRepository(prisma));
  const messageService = new MessageService(new MessageRepository(prisma), deliveryExecutionService, rateLimitService);
  const adminReportingService = new AdminReportingService(new AdminReportingRepository(prisma));
  const adminMetricsService = new AdminMetricsService(new AdminMetricsRepository(prisma), env.DAILY_MESSAGE_LIMIT);

  // Startup: recover stale processing deliveries, then start retry scheduler
  const scheduler = new RetryScheduler(deliveryExecutionRepository, deliveryExecutionService);

  void recoverStaleProcessing(deliveryExecutionRepository).then((count) => {
    if (count > 0) {
      console.log(`[RetryScheduler] Recovered ${count} stale processing deliveries`);
    }
    scheduler.start();
  }).catch((error) => {
    console.error("[RetryScheduler] Stale recovery failed, starting scheduler anyway:", error);
    scheduler.start();
  });

  // Store scheduler for graceful shutdown
  (app as unknown as Record<string, unknown>).locals = { ...app.locals, scheduler };

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
  app.use("/admin/provider-connections", authenticate, requireRole("ADMIN"), createAdminProviderConnectionRouter(providerConnectionService));
  app.use("/notification-targets", authenticate, createNotificationTargetRouter(notificationTargetService));
  app.use("/messages", authenticate, createMessageRouter(messageService));
  app.use("/rate-limit", authenticate, createRateLimitRouter(rateLimitService));
  app.use("/admin", authenticate, requireRole("ADMIN"), createAdminReportingRouter(adminReportingService));
  app.use("/admin", authenticate, requireRole("ADMIN"), createAdminMetricsRouter(adminMetricsService));

  app.get("/me", authenticate, (request, response) => {
    response.status(200).json(request.auth);
  });

  app.get("/admin/auth-check", authenticate, requireRole("ADMIN"), (_request, response) => {
    response.status(200).json({ status: "authorized" });
  });

  app.use(errorMiddleware);

  return app;
}
