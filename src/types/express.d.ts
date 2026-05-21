import type { AuthenticatedUser } from "../modules/auth/auth-context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};
