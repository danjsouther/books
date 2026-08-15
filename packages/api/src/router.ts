import { Router } from 'express';
import type { HealthResponse } from '@books/domain';

export interface ApiDeps {
  /** Reported by `/health`, so a deployment can be identified without shelling in. */
  readonly version: string;
}

/**
 * Builds the `/api/v1` router. Everything the API needs is passed in rather than
 * imported, so an integration test can mount this against `supertest` with test
 * doubles and no server process.
 */
export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = { ok: true, version: deps.version };
    res.json(body);
  });

  return router;
}
