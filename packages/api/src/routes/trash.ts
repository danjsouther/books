import { TrashListQuerySchema, type ListResponse, type TrashItem } from '@books/domain';
import { listTrash } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createTrashRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = TrashListQuerySchema.parse(req.query);
      const { items, total } = await listTrash(db, query);
      const body: ListResponse<TrashItem> = {
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
