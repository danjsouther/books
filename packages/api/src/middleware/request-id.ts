import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Every request gets an id before anything else runs, so the logger, the error
 *  handler, and the response header all agree on the same value. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
