import { AppError, type HealthResponse } from '@books/domain';
import { Router } from 'express';
import { createAuthContext, requireAuth } from './middleware/auth-context';
import { csrfProtection } from './middleware/csrf';
import { errorHandler } from './middleware/error-handler';
import { createHttpLogger } from './middleware/logger';
import { authRateLimiter } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { createActivityRouter } from './routes/activity';
import { createAuthRouter } from './routes/auth';
import { createAuthorsRouter } from './routes/authors';
import { createBooksRouter } from './routes/books';
import { createChangesRouter } from './routes/changes';
import { createReleasesRouter } from './routes/releases';
import { createSeriesRouter } from './routes/series';
import { createTrashRouter } from './routes/trash';
import { createUsersRouter } from './routes/users';
import type { ApiDeps } from './types';

export type { ApiDeps, AuthConfig, AuthenticatedUser } from './types';
export type { DiscordClient } from './auth/discord-client';
export { createDiscordClient } from './auth/discord-client';
export type { ActivityAnnouncer, AnnouncedBook } from './discord/announcer';
export { createDiscordAnnouncer } from './discord/announcer';

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

  // Everything below this line requires auth by construction — no route down here
  // remembers to check for itself.
  router.use(requireAuth);

  router.use('/books', createBooksRouter(deps));
  router.use('/series', createSeriesRouter(deps));
  router.use('/authors', createAuthorsRouter(deps));
  router.use('/releases', createReleasesRouter(deps));
  router.use('/activity', createActivityRouter(deps));
  router.use('/changes', createChangesRouter(deps));
  router.use('/trash', createTrashRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use((req, _res, next) => {
    next(new AppError('not_found', `No such route: ${req.method} ${req.originalUrl}`));
  });

  router.use(errorHandler);

  return router;
}
