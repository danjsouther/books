import {
  AppError,
  RevertRequestSchema,
  RevisionDiffQuerySchema,
  RevisionListQuerySchema,
  SeriesBooksQuerySchema,
  SeriesCreateSchema,
  SeriesListQuerySchema,
  SeriesUpdateSchema,
  type BookSummary,
  type ListResponse,
  type RevisionSummary,
  type SeriesDetail,
  type SeriesSummary,
} from '@books/domain';
import {
  createSeries,
  deleteSeries,
  diffSeriesRevisions,
  getSeriesRevision,
  getSeriesRow,
  listSeriesBooks,
  listSeriesRevisions,
  listSeries,
  restoreSeries,
  revertSeries,
  seriesDetailFromRow,
  updateSeries,
  type Actor,
  type Db,
  type SeriesInput,
} from '@books/db';
import { Router, type Request } from 'express';
import { omitUndefined } from '../lib/patch';
import type { ApiDeps } from '../types';

function actorOf(req: Request): Actor {
  if (req.user === null) throw new AppError('unauthenticated', 'Sign in required.');
  return { id: req.user.id };
}

function parseVersion(raw: string): number {
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new AppError('validation_failed', 'version must be a positive integer.');
  }
  return version;
}

async function requireSeriesRow(db: Db, id: string) {
  const row = await getSeriesRow(db, id);
  if (row === undefined) throw new AppError('not_found', 'No such series.');
  return row;
}

export function createSeriesRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db } = deps;

  router.get('/', (req, res, next) => {
    void (async () => {
      const query = SeriesListQuerySchema.parse(req.query);
      const { items, total } = await listSeries(db, query);
      const body: ListResponse<SeriesSummary> = {
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
      const input = SeriesCreateSchema.parse(req.body);
      const row = await createSeries(
        db,
        { ...input, deletedAt: null, deletedBy: null },
        actorOf(req),
      );
      const body: SeriesDetail = await seriesDetailFromRow(db, row);
      res.status(201).json(body);
    })().catch(next);
  });

  router.get('/:id', (req, res, next) => {
    void (async () => {
      const row = await requireSeriesRow(db, req.params.id);
      const body: SeriesDetail = await seriesDetailFromRow(db, row);
      res.json(body);
    })().catch(next);
  });

  router.patch('/:id', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const { expectedVersion, ...patch } = SeriesUpdateSchema.parse(req.body);
      const row = await updateSeries(
        db,
        id,
        omitUndefined(patch) as Partial<SeriesInput>,
        actorOf(req),
        expectedVersion,
      );
      const body: SeriesDetail = await seriesDetailFromRow(db, row);
      res.json(body);
    })().catch(next);
  });

  router.delete('/:id', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      await deleteSeries(db, id, actorOf(req));
      res.status(204).end();
    })().catch(next);
  });

  router.post('/:id/restore', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const row = await restoreSeries(db, id, actorOf(req));
      const body: SeriesDetail = await seriesDetailFromRow(db, row);
      res.json(body);
    })().catch(next);
  });

  router.get('/:id/books', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const query = SeriesBooksQuerySchema.parse(req.query);
      const { items, total } = await listSeriesBooks(db, id, query);
      const body: ListResponse<BookSummary> = {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
      res.json(body);
    })().catch(next);
  });

  router.get('/:id/revisions', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const query = RevisionListQuerySchema.parse(req.query);
      const { items, total } = await listSeriesRevisions(db, id, query);
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
      res.json(await getSeriesRevision(db, id, version));
    })().catch(next);
  });

  router.get('/:id/revisions/:v/diff', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const version = parseVersion(req.params.v);
      const { against } = RevisionDiffQuerySchema.parse(req.query);
      res.json(await diffSeriesRevisions(db, id, version, against));
    })().catch(next);
  });

  router.post('/:id/revert', (req, res, next) => {
    void (async () => {
      const id = req.params.id;
      const { toVersion, note } = RevertRequestSchema.parse(req.body);
      const row = await revertSeries(db, id, toVersion, actorOf(req), note ?? null);
      const body: SeriesDetail = await seriesDetailFromRow(db, row);
      res.json(body);
    })().catch(next);
  });

  return router;
}
