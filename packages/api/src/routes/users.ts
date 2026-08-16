import {
  UserListQuerySchema,
  UserShelfQuerySchema,
  type ListResponse,
  type ShelfEntry,
  type UserSummary,
} from '@books/domain';
import { getUserProfile, listUserShelf, listUsers } from '@books/db';
import { Router } from 'express';
import type { ApiDeps } from '../types';

export function createUsersRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = UserListQuerySchema.parse(req.query);
      const { items, total } = await listUsers(db, query);
      const body: ListResponse<UserSummary> = {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
      res.json(body);
    })().catch(next);
  });

  router.get('/:id', (req, res, next) => {
    void (async () => {
      res.json(await getUserProfile(db, req.params.id));
    })().catch(next);
  });

  router.get('/:id/shelf', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const query = UserShelfQuerySchema.parse(req.query);
      const { items, total } = await listUserShelf(db, id, query);
      const body: ListResponse<ShelfEntry> = {
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
