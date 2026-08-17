import type {
  BookSummary,
  SeriesBooksQuery,
  SeriesDetail,
  SeriesListQuery,
  SeriesSummary,
} from '@books/domain';
import { and, asc, desc, eq, getTableName, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { series } from '../schema/series';
import type { Book } from '../mutations/books';
import type { Series } from '../mutations/series';
import { authorsByBookIds, toBookSummary } from './books';
import { paginate } from '../lib/paginate';
import { tokenizedMatch } from '../lib/text-search';

// `${series.id}` inside a `sql` template renders as a bare `"id"`, not
// `"series"."id"` — fine at the top level, where `series` is the only table in
// scope, but fatal inside a correlated subquery whose own FROM table (`books`)
// also has an `id` column: an unqualified reference there binds to the innermost
// scope, so it silently resolves to the subquery's own row instead of the outer
// one. Qualifying it explicitly is what makes it a real correlation.
const OUTER_SERIES_ID = sql.raw(`"${getTableName(series)}"."id"`);

const BOOK_COUNT = sql<number>`(
  SELECT count(*)::int FROM ${books} WHERE ${books.seriesId} = ${OUTER_SERIES_ID} AND ${books.deletedAt} IS NULL
)`;

const NEXT_RELEASE = sql<string | null>`(
  SELECT min(${books.releaseDate}) FROM ${books}
  WHERE ${books.seriesId} = ${OUTER_SERIES_ID} AND ${books.deletedAt} IS NULL AND ${books.releaseDate} >= CURRENT_DATE
)`;

function toSeriesSummary(
  row: Series,
  bookCount: number,
  nextRelease: string | null,
): SeriesSummary {
  return {
    id: row.id,
    name: row.name,
    sortName: row.sortName,
    bookCount,
    nextRelease,
    version: row.version,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
  };
}

function buildWhere(filters: SeriesListQuery): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  if (!filters.includeDeleted) clauses.push(isNull(series.deletedAt));
  if (filters.q !== undefined) clauses.push(tokenizedMatch(series.name, filters.q));
  if (filters.hasUpcoming === true) {
    clauses.push(sql`${series.id} IN (
      SELECT ${books.seriesId} FROM ${books}
      WHERE ${books.deletedAt} IS NULL AND ${books.releaseDate} >= CURRENT_DATE
    )`);
  }
  return and(...clauses);
}

const SORT_COLUMNS = {
  name: series.name,
  bookCount: BOOK_COUNT,
  nextRelease: NEXT_RELEASE,
} as const;

export async function listSeries(
  db: Db,
  filters: SeriesListQuery,
): Promise<{ items: SeriesSummary[]; total: number }> {
  const where = buildWhere(filters);
  const orderColumn = SORT_COLUMNS[filters.sort];
  const order = filters.dir === 'desc' ? desc(orderColumn) : asc(orderColumn);

  const rows = db
    .select({ series, bookCount: BOOK_COUNT, nextRelease: NEXT_RELEASE })
    .from(series)
    .where(where)
    .orderBy(order, asc(series.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(series)
    .where(where);

  const { items, total } = await paginate(rows, countQuery);
  return {
    items: items.map((row) => toSeriesSummary(row.series, row.bookCount, row.nextRelease)),
    total,
  };
}

export async function getSeriesRow(db: Db, id: string): Promise<Series | undefined> {
  const [row] = await db.select().from(series).where(eq(series.id, id)).limit(1);
  return row;
}

export async function seriesDetailFromRow(db: Db, row: Series): Promise<SeriesDetail> {
  const [agg] = await db
    .select({ bookCount: BOOK_COUNT, nextRelease: NEXT_RELEASE })
    .from(series)
    .where(eq(series.id, row.id))
    .limit(1);
  return {
    ...toSeriesSummary(row, agg?.bookCount ?? 0, agg?.nextRelease ?? null),
    description: row.description,
    deletedBy: row.deletedBy,
  };
}

const BOOK_SORT_COLUMNS = {
  position: books.seriesPosition,
  release: books.releaseDate,
  title: books.title,
} as const;

export async function listSeriesBooks(
  db: Db,
  seriesId: string,
  filters: SeriesBooksQuery,
): Promise<{ items: BookSummary[]; total: number }> {
  const clauses: (SQL | undefined)[] = [eq(books.seriesId, seriesId), isNull(books.deletedAt)];
  if (filters.status !== undefined) {
    clauses.push(sql`${books.id} IN (
      SELECT book_id FROM book_user_status WHERE status = ${filters.status}
    )`);
  }
  if (filters.hasDate === true) clauses.push(sql`${books.releaseDate} IS NOT NULL`);
  if (filters.hasDate === false) clauses.push(isNull(books.releaseDate));
  const where = and(...clauses);

  const orderColumn = BOOK_SORT_COLUMNS[filters.sort];
  const order = filters.dir === 'desc' ? desc(orderColumn) : asc(orderColumn);

  const rows = db
    .select()
    .from(books)
    .where(where)
    .orderBy(order, asc(books.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(books)
    .where(where);

  const { items: bookRows, total } = await paginate(rows, countQuery);
  const authorsByBook = await authorsByBookIds(
    db,
    bookRows.map((b: Book) => b.id),
  );
  return {
    items: bookRows.map((row: Book) => toBookSummary(row, authorsByBook)),
    total,
  };
}
