import { AppError } from '@books/domain';
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens';
import type { ApiDeps } from '../types';

/**
 * Populates `req.user` and `req.authMethod` and never throws — an invalid or
 * missing credential just means an anonymous request, which `requireAuth` (below)
 * is what turns into a 401. Keeping the two separate is what lets `/auth/refresh`
 * and `/auth/logout` run without a valid access token, which is the whole point
 * of those routes.
 */
export function createAuthContext(deps: Pick<ApiDeps, 'auth'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = null;
    req.authMethod = null;

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const cookies = req.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.['books_at'];

    const token = bearer ?? cookieToken;
    if (token === undefined) {
      next();
      return;
    }

    verifyAccessToken(token, deps.auth.jwtSecret)
      .then((claims) => {
        req.user = { id: claims.sub, client: claims.cli };
        req.authMethod = bearer !== undefined ? 'bearer' : 'cookie';
      })
      .catch(() => {
        // Invalid or expired — the request proceeds unauthenticated rather than
        // failing here, so a route that does not require auth still works.
      })
      .finally(next);
  };
}

/** Every `/api/v1` route mounted after this one requires a valid access token.
 *  UX only — every mutation is re-checked server-side regardless, but this is
 *  what turns a missing credential into a clean 401 before the route runs. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.user === null) {
    next(new AppError('unauthenticated', 'Sign in required.'));
    return;
  }
  next();
}
