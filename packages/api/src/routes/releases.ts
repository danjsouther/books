import { AppError, ReleaseListQuerySchema } from '@books/domain';
import { listReleases } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createReleasesRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = ReleaseListQuerySchema.parse(req.query);
      if (query.mine && req.user === null) {
        throw new AppError('unauthenticated', 'Sign in required for ?mine=true.');
      }
      res.json(await listReleases(db, query, req.user?.id ?? null));
    })().catch(next);
  });

  return router;
}
