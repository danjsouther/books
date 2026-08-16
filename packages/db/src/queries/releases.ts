import type { ReleaseListQuery, ReleasesResponse } from '@books/domain';
import { and, asc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { bookUserStatus } from '../schema/shelf';
import { authorsByBookIds, toBookSummary } from './books';

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
