import type { AuthenticatedUser } from "../modules/identity/auth/auth-context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};
