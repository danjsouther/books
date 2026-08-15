import { and, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { series } from '../schema/series';

/**
 * Forgetting `deleted_at IS NULL` in one query is *the* failure mode of soft
 * deletes, and it fails silently — a trashed book quietly reappears in one list
 * and nowhere else. These builders bake the predicate in, and raw table access is
 * confined to this directory, so reviewing one folder beats reviewing every call
 * site.
 *
 * A record is deleted precisely when its most recent version is a deletion.
 * Because the current row *is* the most recent version, that reduces to
 * `deleted_at IS NULL` here.
 */
export function liveBooks(...extra: (SQL | undefined)[]): SQL | undefined {
  return and(isNull(books.deletedAt), ...extra);
}

export function liveSeries(...extra: (SQL | undefined)[]): SQL | undefined {
  return and(isNull(series.deletedAt), ...extra);
}

export function activeBooks(db: Db, ...extra: (SQL | undefined)[]) {
  return db
    .select()
    .from(books)
    .where(liveBooks(...extra));
}

export function activeSeries(db: Db, ...extra: (SQL | undefined)[]) {
  return db
    .select()
    .from(series)
    .where(liveSeries(...extra));
}
