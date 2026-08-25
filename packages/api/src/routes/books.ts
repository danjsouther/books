import {
  AppError,
  BookCreateSchema,
  BookListQuerySchema,
  BookUpdateSchema,
  RevertRequestSchema,
  RevisionDiffQuerySchema,
  RevisionListQuerySchema,
  ShelfUpdateSchema,
  type BookDetail,
  type BookListItem,
  type ListResponse,
  type RevisionSummary,
} from '@books/domain';
import {
  bookDetailFromRow,
  createBook,
  deleteBook,
  diffBookRevisions,
  getBookRevision,
  getBookRow,
  getBookRowBySlug,
  getShelfStatus,
  listBookRevisions,
  listBooks,
  listBookStatuses,
  removeShelfEntry,
  restoreBook,
  revertBook,
  updateBook,
  upsertShelfStatus,
  type Actor,
  type BookInput,
  type Db,
} from '@books/db';
import { Router, type Request } from 'express';
import { omitUndefined } from '../lib/patch';
import { resolveIdParam } from '../lib/resolve-id-param';
import type { ApiDeps } from '../types';

/** Every request past `requireAuth` has a non-null `req.user` — returns its id
 *  directly rather than as an `Actor`, so callers reading `.id` for something other
 *  than a mutation (the shelf routes, keyed on a real user id) don't inherit
 *  `Actor`'s `string | null` for a value that is never actually null here. */
function actorIdOf(req: Request): string {
  if (req.user === null) throw new AppError('unauthenticated', 'Sign in required.');
  return req.user.id;
}

function actorOf(req: Request): Actor {
  return { id: actorIdOf(req) };
}

function parseVersion(raw: string): number {
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new AppError('validation_failed', 'version must be a positive integer.');
  }
  return version;
}

async function requireBookRow(db: Db, id: string) {
  const row = await getBookRow(db, id);
  if (row === undefined) throw new AppError('not_found', 'No such book.');
  return row;
}

export function createBooksRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db, announcer } = deps;

  resolveIdParam(router, 'id', (slug) => getBookRowBySlug(db, slug));

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = BookListQuerySchema.parse(req.query);
      const { items, total } = await listBooks(db, query, actorIdOf(req));
      const body: ListResponse<BookListItem> = {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
      res.json(body);
    })().catch(next);
  });

  router.post('/', (req, res, next) => {
    void (async () => {
      const input = BookCreateSchema.parse(req.body);
      const row = await createBook(
        db,
        { ...input, deletedAt: null, deletedBy: null },
        actorOf(req),
      );
      const body: BookDetail = await bookDetailFromRow(db, row, req.user?.id ?? null);
      void announcer.announceBookAdded({ title: row.title, slug: row.slug });
      res.status(201).json(body);
    })().catch(next);
  });

  router.get('/:id', (req, res, next) => {
    void (async () => {
      const row = await requireBookRow(db, req.params.id);
      const body: BookDetail = await bookDetailFromRow(db, row, req.user?.id ?? null);
      res.json(body);
    })().catch(next);
  });

  router.patch('/:id', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const { expectedVersion, ...patch } = BookUpdateSchema.parse(req.body);
      const row = await updateBook(
        db,
        id,
        omitUndefined(patch) as Partial<BookInput>,
        actorOf(req),
        expectedVersion,
      );
      const body: BookDetail = await bookDetailFromRow(db, row, req.user?.id ?? null);
      res.json(body);
    })().catch(next);
  });

  router.delete('/:id', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      await deleteBook(db, id, actorOf(req));
      res.status(204).end();
    })().catch(next);
  });

  router.post('/:id/restore', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const row = await restoreBook(db, id, actorOf(req));
      const body: BookDetail = await bookDetailFromRow(db, row, req.user?.id ?? null);
      res.json(body);
    })().catch(next);
  });

  router.get('/:id/revisions', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const query = RevisionListQuerySchema.parse(req.query);
      const { items, total } = await listBookRevisions(db, id, query);
      const body: ListResponse<RevisionSummary> = {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
      res.json(body);
    })().catch(next);
  });

  router.get('/:id/revisions/:v', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const version = parseVersion(req.params.v);
      res.json(await getBookRevision(db, id, version));
    })().catch(next);
  });

  router.get('/:id/revisions/:v/diff', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const version = parseVersion(req.params.v);
      const { against } = RevisionDiffQuerySchema.parse(req.query);
      res.json(await diffBookRevisions(db, id, version, against));
    })().catch(next);
  });

  router.post('/:id/revert', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const { toVersion, note } = RevertRequestSchema.parse(req.body);
      const row = await revertBook(db, id, toVersion, actorOf(req), note ?? null);
      const body: BookDetail = await bookDetailFromRow(db, row, req.user?.id ?? null);
      res.json(body);
    })().catch(next);
  });

  router.get('/:id/statuses', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      res.json(await listBookStatuses(db, id));
    })().catch(next);
  });

  router.get('/:id/me', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const userId = actorIdOf(req);
      res.json((await getShelfStatus(db, id, userId)) ?? null);
    })().catch(next);
  });

  router.patch('/:id/me', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const userId = actorIdOf(req);
      const patch = ShelfUpdateSchema.parse(req.body);
      res.json(await upsertShelfStatus(db, id, userId, patch));
    })().catch(next);
  });

  router.delete('/:id/me', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const userId = actorIdOf(req);
      await removeShelfEntry(db, id, userId);
      res.status(204).end();
    })().catch(next);
  });

  return router;
}
