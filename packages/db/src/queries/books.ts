import type {
  BookDetail,
  BookListQuery,
  BookSummary,
  RatingSummary,
  UserBookStatus,
} from '@books/domain';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { authorBooks } from '../schema/author-books';
import { authors } from '../schema/authors';
import { books } from '../schema/books';
import { bookUserStatus } from '../schema/shelf';
import { authorsOfBook } from '../mutations/authors';
import type { Book } from '../mutations/books';
import { paginate } from '../lib/paginate';

export function toBookSummary(
  row: Book,
  authorsByBook: Map<string, { id: string; name: string }[]>,
): BookSummary {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    authors: authorsByBook.get(row.id) ?? [],
    seriesId: row.seriesId,
    seriesPosition: row.seriesPosition,
    releaseDate: row.releaseDate,
    releasePrecision: row.releasePrecision,
    asin: row.asin,
    coverUrl: row.coverUrl,
    version: row.version,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
  };
}

/** Batch-fetches authors for a page of books in one query, preserving credited
 *  order — the N+1-per-row alternative is not worth avoiding a join for a page
 *  capped at 100 rows, but a query per row on top of that would be. */
export async function authorsByBookIds(
  db: Db,
  bookIds: readonly string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (bookIds.length === 0) return map;
  const rows = await db
    .select({ bookId: authorBooks.bookId, id: authors.id, name: authors.name })
    .from(authorBooks)
    .innerJoin(authors, eq(authors.id, authorBooks.authorId))
    .where(inArray(authorBooks.bookId, bookIds))
    .orderBy(asc(authorBooks.position));
  for (const row of rows) {
    const list = map.get(row.bookId) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.bookId, list);
  }
  return map;
}

function booksByAuthorName(name: string) {
  return sql`${books.id} IN (
    SELECT ${authorBooks.bookId} FROM ${authorBooks}
    JOIN ${authors} ON ${authors.id} = ${authorBooks.authorId}
    WHERE lower(${authors.name}) = lower(${name})
  )`;
}

function booksWithStatus(status: string) {
  return sql`${books.id} IN (
    SELECT ${bookUserStatus.bookId} FROM ${bookUserStatus} WHERE ${bookUserStatus.status} = ${status}
  )`;
}

function booksRatedBy(userId: string) {
  return sql`${books.id} IN (
    SELECT ${bookUserStatus.bookId} FROM ${bookUserStatus}
    WHERE ${bookUserStatus.userId} = ${userId} AND ${bookUserStatus.rating} IS NOT NULL
  )`;
}

function buildWhere(filters: BookListQuery): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  if (!filters.includeDeleted) clauses.push(isNull(books.deletedAt));
  if (filters.q !== undefined && filters.q !== '') {
    clauses.push(sql`${books.title} ILIKE ${`%${filters.q}%`}`);
  }
  if (filters.seriesId !== undefined) clauses.push(eq(books.seriesId, filters.seriesId));
  if (filters.author !== undefined) clauses.push(booksByAuthorName(filters.author));
  if (filters.status !== undefined) clauses.push(booksWithStatus(filters.status));
  if (filters.ratedBy !== undefined) clauses.push(booksRatedBy(filters.ratedBy));
  if (filters.releasedFrom !== undefined)
    clauses.push(gte(books.releaseDate, filters.releasedFrom));
  if (filters.releasedTo !== undefined) clauses.push(lte(books.releaseDate, filters.releasedTo));
  if (filters.hasDate === true) clauses.push(sql`${books.releaseDate} IS NOT NULL`);
  if (filters.hasDate === false) clauses.push(isNull(books.releaseDate));
  return and(...clauses);
}

const SORT_COLUMNS = {
  title: books.title,
  release: books.releaseDate,
  created: books.createdAt,
  updated: books.updatedAt,
  // No per-book rating column exists; sorting by rating without an aggregate join
  // is not supported yet, so it falls back to title. Revisit if the book list ever
  // needs to sort by average rating.
  rating: books.title,
} as const;

export async function listBooks(
  db: Db,
  filters: BookListQuery,
): Promise<{ items: BookSummary[]; total: number }> {
  const where = buildWhere(filters);
  const orderColumn = SORT_COLUMNS[filters.sort];
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
    bookRows.map((b) => b.id),
  );
  return { items: bookRows.map((row) => toBookSummary(row, authorsByBook)), total };
}

export async function getBookRow(db: Db, id: string): Promise<Book | undefined> {
  const [row] = await db.select().from(books).where(eq(books.id, id)).limit(1);
  return row;
}

export async function listBookStatuses(db: Db, bookId: string): Promise<UserBookStatus[]> {
  const rows = await db.select().from(bookUserStatus).where(eq(bookUserStatus.bookId, bookId));
  return rows.map(toUserBookStatus);
}

async function ratingSummaryOf(db: Db, bookId: string): Promise<RatingSummary> {
  const rows = await db
    .select({ rating: bookUserStatus.rating, count: sql<number>`count(*)::int` })
    .from(bookUserStatus)
    .where(and(eq(bookUserStatus.bookId, bookId), sql`${bookUserStatus.rating} IS NOT NULL`))
    .groupBy(bookUserStatus.rating);

  const distribution = new Array<number>(11).fill(0);
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (row.rating === null) continue;
    distribution[row.rating] = row.count;
    sum += row.rating * row.count;
    count += row.count;
  }
  return { average: count === 0 ? null : sum / count, count, distribution };
}

export function toUserBookStatus(row: typeof bookUserStatus.$inferSelect): UserBookStatus {
  return {
    bookId: row.bookId,
    userId: row.userId,
    status: row.status,
    rating: row.rating,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Everything `BookDetail` needs, resolved from a live row already in hand — the
 *  route layer decides what "not found" means (missing vs. soft-deleted), this just
 *  assembles the detail shape. */
export async function bookDetailFromRow(
  db: Db,
  row: Book,
  viewerUserId: string | null,
): Promise<BookDetail> {
  const [bookAuthors, statusRows, ratingSummary] = await Promise.all([
    authorsOfBook(db, row.id),
    db.select().from(bookUserStatus).where(eq(bookUserStatus.bookId, row.id)),
    ratingSummaryOf(db, row.id),
  ]);
  const statuses = statusRows.map(toUserBookStatus);
  const myStatus =
    viewerUserId === null ? null : (statuses.find((s) => s.userId === viewerUserId) ?? null);

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    authors: bookAuthors,
    seriesId: row.seriesId,
    seriesPosition: row.seriesPosition,
    releaseDate: row.releaseDate,
    releasePrecision: row.releasePrecision,
    pageCount: row.pageCount,
    asin: row.asin,
    coverUrl: row.coverUrl,
    version: row.version,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    deletedBy: row.deletedBy,
    myStatus,
    statuses,
    ratingSummary,
  };
}
