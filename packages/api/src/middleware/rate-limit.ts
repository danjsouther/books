import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

/** `/auth/*` is where credential-stuffing and refresh-token brute forcing would
 *  land, so it gets a tighter window than the rest of the API ever will. */
export function authRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
