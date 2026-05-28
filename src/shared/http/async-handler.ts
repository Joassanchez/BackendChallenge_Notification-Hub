import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AsyncRequestHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}
