import { ActivityListQuerySchema } from '@books/domain';
import { listActivity } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createActivityRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = ActivityListQuerySchema.parse(req.query);
      res.json(await listActivity(db, query));
    })().catch(next);
  });

  return router;
}
