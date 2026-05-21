import type { RequestHandler } from "express";
import { forbidden, unauthorized } from "../../shared/http/errors.js";
import type { RoleName } from "./role-code.js";

export function requireRole(role: RoleName): RequestHandler {
  return (request, _response, next) => {
    if (request.auth === undefined) {
      next(unauthorized());
      return;
    }

    if (!request.auth.roles.includes(role)) {
      next(forbidden());
      return;
    }

    next();
  };
}
