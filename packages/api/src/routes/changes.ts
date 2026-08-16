import { ChangeListQuerySchema, type ChangeItem, type ListResponse } from '@books/domain';
import { listChanges } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createChangesRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = ChangeListQuerySchema.parse(req.query);
      const { items, total } = await listChanges(db, query);
      const body: ListResponse<ChangeItem> = {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
      res.json(body);
    })().catch(next);
  });

  return router;
}
