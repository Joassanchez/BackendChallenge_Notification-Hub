import express from "express";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { createAuthenticateMiddleware } from "./modules/auth/authenticate.middleware.js";
import { PasswordService } from "./modules/auth/password.service.js";
import { TokenService } from "./modules/auth/token.service.js";
import { MessageRepository } from "./modules/messages/message-repository.js";
import { createMessageRouter } from "./modules/messages/message.routes.js";
import { MessageService } from "./modules/messages/message.service.js";
import { requireRole } from "./modules/roles/require-role.middleware.js";
import { UserRepository } from "./modules/users/user-repository.js";
import { prisma } from "./shared/database/prisma.js";
import { errorMiddleware } from "./shared/http/error-middleware.js";

export function createApp() {
  const app = express();

  const userRepository = new UserRepository(prisma);
  const tokenService = new TokenService();
  const authService = new AuthService(userRepository, new PasswordService(), tokenService);
  const authenticate = createAuthenticateMiddleware(tokenService, userRepository);
  const messageService = new MessageService(new MessageRepository(prisma));

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use("/auth", createAuthRouter(authService));
  app.use("/messages", authenticate, createMessageRouter(messageService));

  app.get("/me", authenticate, (request, response) => {
    response.status(200).json(request.auth);
  });

  app.get("/admin/auth-check", authenticate, requireRole("ADMIN"), (_request, response) => {
    response.status(200).json({ status: "authorized" });
  });

  app.use(errorMiddleware);

  return app;
}
