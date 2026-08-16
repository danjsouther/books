import { AuthorListQuerySchema } from '@books/domain';
import { listAuthors } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createAuthorsRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const { q } = AuthorListQuerySchema.parse(req.query);
      res.json(await listAuthors(db, q));
    })().catch(next);
  });

  return router;
}
