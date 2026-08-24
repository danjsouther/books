import type { TrashItem, TrashListQuery } from '@books/domain';
import { and, eq, isNotNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { series } from '../schema/series';
import { tokenizedMatch } from '../lib/text-search';

async function fetchTrashedBooks(db: Db, filters: TrashListQuery): Promise<TrashItem[]> {
  const clauses: (SQL | undefined)[] = [isNotNull(books.deletedAt)];
  if (filters.q !== undefined) clauses.push(tokenizedMatch(books.title, filters.q));
  if (filters.deletedBy !== undefined) clauses.push(eq(books.deletedBy, filters.deletedBy));

  const rows = await db
    .select()
    .from(books)
    .where(and(...clauses));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    type: 'book' as const,
    title: row.title,
    // `deletedAt` is non-null by construction of the `IS NOT NULL` filter above.
    deletedAt: row.deletedAt!.toISOString(),
    deletedBy: row.deletedBy,
  }));
}

async function fetchTrashedSeries(db: Db, filters: TrashListQuery): Promise<TrashItem[]> {
  const clauses: (SQL | undefined)[] = [isNotNull(series.deletedAt)];
  if (filters.q !== undefined) clauses.push(tokenizedMatch(series.name, filters.q));
  if (filters.deletedBy !== undefined) clauses.push(eq(series.deletedBy, filters.deletedBy));

  const rows = await db
    .select()
    .from(series)
    .where(and(...clauses));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    type: 'series' as const,
    title: row.name,
    deletedAt: row.deletedAt!.toISOString(),
    deletedBy: row.deletedBy,
  }));
}

/** A union over soft-deleted books and series, merged and sorted in application code
 *  for the same reason as `listChanges` — a private tool with a small catalog, where
 *  two filtered fetches and an in-memory merge beat a cross-table SQL `UNION ALL`. */
export async function listTrash(
  db: Db,
  filters: TrashListQuery,
): Promise<{ items: TrashItem[]; total: number }> {
  const [bookItems, seriesItems] = await Promise.all([
    filters.type === 'series' ? Promise.resolve([]) : fetchTrashedBooks(db, filters),
    filters.type === 'book' ? Promise.resolve([]) : fetchTrashedSeries(db, filters),
  ]);

  const all = [...bookItems, ...seriesItems].sort((a, b) => {
    const cmp =
      filters.sort === 'title'
        ? a.title.localeCompare(b.title)
        : a.deletedAt.localeCompare(b.deletedAt);
    return filters.dir === 'desc' ? -cmp : cmp;
  });

  const total = all.length;
  const start = (filters.page - 1) * filters.pageSize;
  return { items: all.slice(start, start + filters.pageSize), total };
}
