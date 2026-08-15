import { AppError, type HealthResponse } from '@books/domain';
import { Router } from 'express';
import { createAuthContext, requireAuth } from './middleware/auth-context';
import { csrfProtection } from './middleware/csrf';
import { errorHandler } from './middleware/error-handler';
import { createHttpLogger } from './middleware/logger';
import { authRateLimiter } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { createAuthRouter } from './routes/auth';
import type { ApiDeps } from './types';

export type { ApiDeps, AuthConfig, AuthenticatedUser } from './types';
export type { DiscordClient } from './auth/discord-client';
export { createDiscordClient } from './auth/discord-client';

/**
 * Builds the `/api/v1` router. Everything the API needs is passed in rather than
 * imported, so an integration test can mount this against `supertest` with test
 * doubles and no server process.
 *
 * Stack order matters: `requestId` and the logger need to run before anything
 * else so every later log line and error carries an id; `auth` populates
 * `req.user` without ever throwing, so routes that do not require auth (health,
 * the Discord endpoints, refresh, logout) still work when no credential is
 * presented; `csrf` runs after auth because its cookie-vs-bearer branch depends
 * on `req.authMethod`. `requireAuth` is mounted once, after `/auth`, so every
 * business route Phase 4 adds is protected by construction rather than by each
 * route remembering to check.
 */
export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();

  router.use(requestId);
  router.use(createHttpLogger());
  router.use(createAuthContext(deps));
  router.use(csrfProtection(deps.auth));

  router.get('/health', (_req, res) => {
    const body: HealthResponse = { ok: true, version: deps.version };
    res.json(body);
  });

  router.use('/auth', authRateLimiter(), createAuthRouter(deps));

  // Phase 4's book/series/etc. routes mount below this line and inherit auth for
  // free. Nothing does yet, so this currently guards an empty stretch of router —
  // every remaining request is unmatched, and gets a clean 404 rather than
  // falling through to the SPA fallback or a bare 500.
  router.use(requireAuth);
  router.use((req, _res, next) => {
    next(new AppError('not_found', `No such route: ${req.method} ${req.originalUrl}`));
  });

  router.use(errorHandler);

  return router;
}
