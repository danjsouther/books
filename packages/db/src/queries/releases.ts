import type { ReleaseListQuery, ReleasePrecision, ReleasesResponse } from '@books/domain';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { series } from '../schema/series';
import { bookUserStatus } from '../schema/shelf';
import { authorsByBookIds, toBookSummary } from './books';
import { liveBooks } from './active';

/**
 * One query for the whole window, bucketed by precision in application code rather
 * than four separate `WHERE release_precision = ...` queries — the precision enum
 * already IS the bucket discriminant, so re-deriving it in SQL four times would just
 * restate what `releasePrecision` already says.
 */
export async function listReleases(db: Db, filters: ReleaseListQuery, viewerUserId: string | null) {
  const clauses: (SQL | undefined)[] = [isNull(books.deletedAt)];

  const inWindow = and(gte(books.releaseDate, filters.from), lte(books.releaseDate, filters.to));
  clauses.push(filters.includeUndated ? or(inWindow, isNull(books.releaseDate)) : inWindow);

  if (filters.seriesId !== undefined) clauses.push(eq(books.seriesId, filters.seriesId));
  if (filters.mine) {
    if (viewerUserId === null) {
      return emptyReleases(filters);
    }
    clauses.push(sql`${books.id} IN (
      SELECT ${bookUserStatus.bookId} FROM ${bookUserStatus}
      WHERE ${bookUserStatus.userId} = ${viewerUserId} AND ${bookUserStatus.status} = 'plan'
    )`);
  }

  const rows = await db
    .select()
    .from(books)
    .where(and(...clauses))
    .orderBy(asc(books.releaseDate), asc(books.id));

  const authorsByBook = await authorsByBookIds(
    db,
    rows.map((r) => r.id),
  );

  const response: ReleasesResponse = {
    dated: [],
    monthly: [],
    yearly: [],
    undated: [],
    window: { from: filters.from, to: filters.to },
  };

  for (const row of rows) {
    const summary = toBookSummary(row, authorsByBook);
    switch (row.releasePrecision) {
      case 'day':
        response.dated.push(summary);
        break;
      case 'month':
        response.monthly.push(summary);
        break;
      case 'year':
        response.yearly.push(summary);
        break;
      case 'unknown':
        response.undated.push(summary);
        break;
    }
  }
  return response;
}

function emptyReleases(filters: ReleaseListQuery): ReleasesResponse {
  return {
    dated: [],
    monthly: [],
    yearly: [],
    undated: [],
    window: { from: filters.from, to: filters.to },
  };
}

/** Response item of `listUpcomingReleases` — flat and chronological, unlike
 *  `ReleasesResponse`'s precision buckets, since the bot's `/upcoming` embed
 *  groups by month itself rather than by precision. */
export interface UpcomingRelease {
  readonly id: string;
  readonly title: string;
  readonly releaseDate: string;
  readonly releasePrecision: ReleasePrecision;
  readonly seriesId: string | null;
  readonly seriesName: string | null;
  readonly seriesPosition: string | null;
}

export interface UpcomingReleasesFilters {
  readonly from: string;
  readonly to: string;
  /** Also include month/year-precision books, not just day-precision. */
  readonly includeTba: boolean;
  readonly seriesId?: string;
  /** Restricts to this viewer's `plan`-status books. */
  readonly mineUserId?: string;
}

const DAY_ONLY: ReleasePrecision[] = ['day'];
const DAY_MONTH_YEAR: ReleasePrecision[] = ['day', 'month', 'year'];

/**
 * The bot's own query, built on `liveBooks()` directly rather than
 * `activeBooks()` — `activeBooks()` returns a plain `select().from(books)`
 * with no room for the `series` join this embed needs, but `liveBooks()` is
 * the same soft-delete predicate it's built from, applied to a custom
 * joined `select` instead. Never a hand-rolled `deleted_at IS NULL`.
 */
export async function listUpcomingReleases(
  db: Db,
  filters: UpcomingReleasesFilters,
): Promise<UpcomingRelease[]> {
  const clauses: (SQL | undefined)[] = [
    inArray(books.releasePrecision, filters.includeTba ? DAY_MONTH_YEAR : DAY_ONLY),
    gte(books.releaseDate, filters.from),
    lte(books.releaseDate, filters.to),
  ];
  if (filters.seriesId !== undefined) clauses.push(eq(books.seriesId, filters.seriesId));
  if (filters.mineUserId !== undefined) {
    clauses.push(sql`${books.id} IN (
      SELECT ${bookUserStatus.bookId} FROM ${bookUserStatus}
      WHERE ${bookUserStatus.userId} = ${filters.mineUserId} AND ${bookUserStatus.status} = 'plan'
    )`);
  }

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      releaseDate: books.releaseDate,
      releasePrecision: books.releasePrecision,
      seriesId: books.seriesId,
      seriesName: series.name,
      seriesPosition: books.seriesPosition,
    })
    .from(books)
    .leftJoin(series, eq(series.id, books.seriesId))
    .where(liveBooks(...clauses))
    .orderBy(asc(books.releaseDate), asc(books.title));

  // `releaseDate`/`seriesPosition` are non-null here: the precision filter
  // above guarantees `releaseDate` (only `unknown`-precision books have a
  // null date), and a book missing from a series simply has a null `seriesId`.
  return rows.map((row) => ({ ...row, releaseDate: row.releaseDate! }));
}
