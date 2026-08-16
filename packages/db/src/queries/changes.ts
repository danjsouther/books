import type { ChangeItem, ChangeListQuery } from '@books/domain';
import { diffSnapshots } from '@books/domain';
import { and, eq, gte, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { bookRevisions, seriesRevisions } from '../schema/revisions';
import { series } from '../schema/series';

interface RawChangeRow {
  readonly entityType: 'book' | 'series';
  readonly entityId: string;
  readonly version: number;
  readonly changeKind: ChangeItem['changeKind'];
  readonly actorId: string | null;
  readonly changedAt: Date;
  readonly title: string;
  readonly snapshot: unknown;
}

async function fetchBookRows(db: Db, filters: ChangeListQuery): Promise<RawChangeRow[]> {
  const clauses: (SQL | undefined)[] = [];
  if (filters.entityId !== undefined) clauses.push(eq(bookRevisions.bookId, filters.entityId));
  if (filters.changeKind !== undefined)
    clauses.push(eq(bookRevisions.changeKind, filters.changeKind));
  if (filters.actorId !== undefined) clauses.push(eq(bookRevisions.changedBy, filters.actorId));
  if (filters.since !== undefined)
    clauses.push(gte(bookRevisions.changedAt, new Date(filters.since)));

  const rows = await db
    .select({
      bookId: bookRevisions.bookId,
      version: bookRevisions.version,
      changeKind: bookRevisions.changeKind,
      changedBy: bookRevisions.changedBy,
      changedAt: bookRevisions.changedAt,
      snapshot: bookRevisions.snapshot,
      title: books.title,
    })
    .from(bookRevisions)
    .innerJoin(books, eq(books.id, bookRevisions.bookId))
    .where(and(...clauses));

  return rows.map((r) => ({
    entityType: 'book' as const,
    entityId: r.bookId,
    version: r.version,
    changeKind: r.changeKind,
    actorId: r.changedBy,
    changedAt: r.changedAt,
    title: r.title,
    snapshot: r.snapshot,
  }));
}

async function fetchSeriesRows(db: Db, filters: ChangeListQuery): Promise<RawChangeRow[]> {
  const clauses: (SQL | undefined)[] = [];
  if (filters.entityId !== undefined) clauses.push(eq(seriesRevisions.seriesId, filters.entityId));
  if (filters.changeKind !== undefined)
    clauses.push(eq(seriesRevisions.changeKind, filters.changeKind));
  if (filters.actorId !== undefined) clauses.push(eq(seriesRevisions.changedBy, filters.actorId));
  if (filters.since !== undefined)
    clauses.push(gte(seriesRevisions.changedAt, new Date(filters.since)));

  const rows = await db
    .select({
      seriesId: seriesRevisions.seriesId,
      version: seriesRevisions.version,
      changeKind: seriesRevisions.changeKind,
      changedBy: seriesRevisions.changedBy,
      changedAt: seriesRevisions.changedAt,
      snapshot: seriesRevisions.snapshot,
      title: series.name,
    })
    .from(seriesRevisions)
    .innerJoin(series, eq(series.id, seriesRevisions.seriesId))
    .where(and(...clauses));

  return rows.map((r) => ({
    entityType: 'series' as const,
    entityId: r.seriesId,
    version: r.version,
    changeKind: r.changeKind,
    actorId: r.changedBy,
    changedAt: r.changedAt,
    title: r.title,
    snapshot: r.snapshot,
  }));
}

async function previousSnapshot(db: Db, row: RawChangeRow): Promise<Record<string, unknown>> {
  if (row.version <= 1) return {};
  if (row.entityType === 'book') {
    const [prev] = await db
      .select({ snapshot: bookRevisions.snapshot })
      .from(bookRevisions)
      .where(
        and(eq(bookRevisions.bookId, row.entityId), eq(bookRevisions.version, row.version - 1)),
      )
      .limit(1);
    return (prev?.snapshot as Record<string, unknown> | undefined) ?? {};
  }
  const [prev] = await db
    .select({ snapshot: seriesRevisions.snapshot })
    .from(seriesRevisions)
    .where(
      and(eq(seriesRevisions.seriesId, row.entityId), eq(seriesRevisions.version, row.version - 1)),
    )
    .limit(1);
  return (prev?.snapshot as Record<string, unknown> | undefined) ?? {};
}

/**
 * A union over both revision tables, not a table of its own — `book_revisions` and
 * `series_revisions` are the only source of truth for what changed. Filtering and
 * sorting happen in application code rather than SQL `UNION ALL`, since this is a
 * private tool for a handful of members and a handful of catalog records: fetching
 * both filtered sets in full and merging them in memory is simpler than a
 * cross-table window function, and cheap enough at this scale to not be worth the
 * complexity. Revisit if the catalog ever grows past what fits in memory.
 */
export async function listChanges(
  db: Db,
  filters: ChangeListQuery,
): Promise<{ items: ChangeItem[]; total: number }> {
  const [bookRows, seriesRows] = await Promise.all([
    filters.entityType === 'series' ? Promise.resolve([]) : fetchBookRows(db, filters),
    filters.entityType === 'book' ? Promise.resolve([]) : fetchSeriesRows(db, filters),
  ]);

  const all = [...bookRows, ...seriesRows].sort(
    (a, b) => b.changedAt.getTime() - a.changedAt.getTime(),
  );
  const total = all.length;
  const start = (filters.page - 1) * filters.pageSize;
  const page = all.slice(start, start + filters.pageSize);

  const items: ChangeItem[] = await Promise.all(
    page.map(async (row) => {
      const before = await previousSnapshot(db, row);
      const diffs = diffSnapshots(before, row.snapshot as Record<string, unknown>);
      return {
        entityType: row.entityType,
        entityId: row.entityId,
        version: row.version,
        changeKind: row.changeKind,
        actorId: row.actorId,
        changedAt: row.changedAt.toISOString(),
        title: row.title,
        changedFields: diffs.map((d) => d.field),
      };
    }),
  );

  return { items, total };
}
