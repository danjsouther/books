import type { FieldDiff, Revision, RevisionListQuery, RevisionSummary } from '@books/domain';
import { AppError, diffSnapshots } from '@books/domain';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { bookRevisions, seriesRevisions } from '../schema/revisions';
import { paginate } from '../lib/paginate';

function toSummary(row: {
  version: number;
  changeKind: RevisionSummary['changeKind'];
  changedBy: string | null;
  changedAt: Date;
  note: string | null;
}): RevisionSummary {
  return {
    version: row.version,
    changeKind: row.changeKind,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
    note: row.note,
  };
}

export async function listBookRevisions(
  db: Db,
  bookId: string,
  filters: RevisionListQuery,
): Promise<{ items: RevisionSummary[]; total: number }> {
  const clauses: (SQL | undefined)[] = [eq(bookRevisions.bookId, bookId)];
  if (filters.actorId !== undefined) clauses.push(eq(bookRevisions.changedBy, filters.actorId));
  if (filters.changeKind !== undefined)
    clauses.push(eq(bookRevisions.changeKind, filters.changeKind));
  const where = and(...clauses);

  const rows = db
    .select({
      version: bookRevisions.version,
      changeKind: bookRevisions.changeKind,
      changedBy: bookRevisions.changedBy,
      changedAt: bookRevisions.changedAt,
      note: bookRevisions.note,
    })
    .from(bookRevisions)
    .where(where)
    .orderBy(filters.dir === 'asc' ? asc(bookRevisions.version) : desc(bookRevisions.version))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookRevisions)
    .where(where);

  const { items, total } = await paginate(rows, countQuery);
  return { items: items.map(toSummary), total };
}

export async function getBookRevision(db: Db, bookId: string, version: number): Promise<Revision> {
  const [row] = await db
    .select()
    .from(bookRevisions)
    .where(and(eq(bookRevisions.bookId, bookId), eq(bookRevisions.version, version)))
    .limit(1);
  if (row === undefined)
    throw new AppError('not_found', `This book has no version ${String(version)}.`);
  return { ...toSummary(row), snapshot: row.snapshot };
}

export async function diffBookRevisions(
  db: Db,
  bookId: string,
  version: number,
  against: number,
): Promise<FieldDiff[]> {
  const [a, b] = await Promise.all([
    getBookRevision(db, bookId, against),
    getBookRevision(db, bookId, version),
  ]);
  return diffSnapshots(
    a.snapshot as Record<string, unknown>,
    b.snapshot as Record<string, unknown>,
  );
}

export async function listSeriesRevisions(
  db: Db,
  seriesId: string,
  filters: RevisionListQuery,
): Promise<{ items: RevisionSummary[]; total: number }> {
  const clauses: (SQL | undefined)[] = [eq(seriesRevisions.seriesId, seriesId)];
  if (filters.actorId !== undefined) clauses.push(eq(seriesRevisions.changedBy, filters.actorId));
  if (filters.changeKind !== undefined)
    clauses.push(eq(seriesRevisions.changeKind, filters.changeKind));
  const where = and(...clauses);

  const rows = db
    .select({
      version: seriesRevisions.version,
      changeKind: seriesRevisions.changeKind,
      changedBy: seriesRevisions.changedBy,
      changedAt: seriesRevisions.changedAt,
      note: seriesRevisions.note,
    })
    .from(seriesRevisions)
    .where(where)
    .orderBy(filters.dir === 'asc' ? asc(seriesRevisions.version) : desc(seriesRevisions.version))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(seriesRevisions)
    .where(where);

  const { items, total } = await paginate(rows, countQuery);
  return { items: items.map(toSummary), total };
}

export async function getSeriesRevision(
  db: Db,
  seriesId: string,
  version: number,
): Promise<Revision> {
  const [row] = await db
    .select()
    .from(seriesRevisions)
    .where(and(eq(seriesRevisions.seriesId, seriesId), eq(seriesRevisions.version, version)))
    .limit(1);
  if (row === undefined) {
    throw new AppError('not_found', `This series has no version ${String(version)}.`);
  }
  return { ...toSummary(row), snapshot: row.snapshot };
}

export async function diffSeriesRevisions(
  db: Db,
  seriesId: string,
  version: number,
  against: number,
): Promise<FieldDiff[]> {
  const [a, b] = await Promise.all([
    getSeriesRevision(db, seriesId, against),
    getSeriesRevision(db, seriesId, version),
  ]);
  return diffSnapshots(
    a.snapshot as Record<string, unknown>,
    b.snapshot as Record<string, unknown>,
  );
}
