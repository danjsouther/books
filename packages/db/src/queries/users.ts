import type {
  BookStatus,
  ShelfEntry,
  UserBookStatus,
  UserListQuery,
  UserProfile,
  UserShelfQuery,
  UserSummary,
} from '@books/domain';
import { AppError, BOOK_STATUSES } from '@books/domain';
import { and, asc, desc, eq, getTableName, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { books } from '../schema/books';
import { paginate } from '../lib/paginate';
import { bookUserStatus } from '../schema/shelf';
import { users } from '../schema/users';
import { authorsByBookIds, toBookSummary } from './books';

export type User = typeof users.$inferSelect;

export interface DiscordProfile {
  readonly discordId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarHash: string | null;
}

/**
 * `users` is not a versioned catalog record — no revision history, no soft delete.
 * Login is the only writer, so a plain upsert on `discord_id` is all it needs.
 */
export async function upsertUserFromDiscord(db: Db, profile: DiscordProfile): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ ...profile, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: users.discordId,
      set: {
        username: profile.username,
        displayName: profile.displayName,
        avatarHash: profile.avatarHash,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (row === undefined) throw new Error('Upsert returned no row.');
  return row;
}

export async function findUserById(db: Db, id: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

// See the identical note in `queries/series.ts`: `${users.id}` renders as a bare
// `"id"` inside a `sql` template, which is ambiguous — or silently wrong — once it
// is nested inside a correlated subquery. Qualified explicitly here rather than
// relying on `book_user_status` happening to have no `id` column of its own today.
const OUTER_USER_ID = sql.raw(`"${getTableName(users)}"."id"`);

const BOOK_COUNT = sql<number>`(
  SELECT count(DISTINCT ${bookUserStatus.bookId})::int FROM ${bookUserStatus}
  WHERE ${bookUserStatus.userId} = ${OUTER_USER_ID}
)`;

// `avg()` returns `numeric`, which node-postgres hands back as a string rather than
// parsing — the same reason count queries elsewhere are cast `::int`. `::float8` gets
// a real JS number back.
const AVG_RATING = sql<number | null>`(
  SELECT avg(${bookUserStatus.rating})::float8 FROM ${bookUserStatus}
  WHERE ${bookUserStatus.userId} = ${OUTER_USER_ID} AND ${bookUserStatus.rating} IS NOT NULL
)`;

function toUserSummary(row: User, bookCount: number, avgRating: number | null): UserSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarHash: row.avatarHash,
    bookCount,
    avgRating,
  };
}

const USER_SORT_COLUMNS = {
  name: users.username,
  bookCount: BOOK_COUNT,
  avgRating: AVG_RATING,
} as const;

export async function listUsers(
  db: Db,
  filters: UserListQuery,
): Promise<{ items: UserSummary[]; total: number }> {
  const clauses: (SQL | undefined)[] = [];
  if (filters.q !== undefined && filters.q !== '') {
    clauses.push(sql`${users.username} ILIKE ${`%${filters.q}%`}`);
  }
  const where = and(...clauses);

  const orderColumn = USER_SORT_COLUMNS[filters.sort];
  const order = filters.dir === 'desc' ? desc(orderColumn) : asc(orderColumn);

  const rows = db
    .select({ user: users, bookCount: BOOK_COUNT, avgRating: AVG_RATING })
    .from(users)
    .where(where)
    .orderBy(order, asc(users.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const { items, total } = await paginate(rows, countQuery);
  return {
    items: items.map((row) => toUserSummary(row.user, row.bookCount, row.avgRating)),
    total,
  };
}

export async function getUserProfile(db: Db, id: string): Promise<UserProfile> {
  const [row] = await db
    .select({ user: users, bookCount: BOOK_COUNT, avgRating: AVG_RATING })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (row === undefined) throw new AppError('not_found', 'No such user.');

  const statusRows = await db
    .select({ status: bookUserStatus.status, count: sql<number>`count(*)::int` })
    .from(bookUserStatus)
    .where(eq(bookUserStatus.userId, id))
    .groupBy(bookUserStatus.status);

  const statusCounts = Object.fromEntries(BOOK_STATUSES.map((s) => [s, 0])) as Record<
    BookStatus,
    number
  >;
  for (const s of statusRows) statusCounts[s.status] = s.count;

  return { ...toUserSummary(row.user, row.bookCount, row.avgRating), statusCounts };
}

const SHELF_SORT_COLUMNS = {
  updated: bookUserStatus.updatedAt,
  title: books.title,
  rating: bookUserStatus.rating,
  release: books.releaseDate,
} as const;

function toUserBookStatus(row: typeof bookUserStatus.$inferSelect): UserBookStatus {
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

export async function listUserShelf(
  db: Db,
  userId: string,
  filters: UserShelfQuery,
): Promise<{ items: ShelfEntry[]; total: number }> {
  const clauses: (SQL | undefined)[] = [eq(bookUserStatus.userId, userId)];
  if (filters.status !== undefined) clauses.push(eq(bookUserStatus.status, filters.status));
  if (filters.seriesId !== undefined) clauses.push(eq(books.seriesId, filters.seriesId));
  if (filters.q !== undefined && filters.q !== '') {
    clauses.push(sql`${books.title} ILIKE ${`%${filters.q}%`}`);
  }
  const where = and(...clauses);

  const orderColumn = SHELF_SORT_COLUMNS[filters.sort];
  const order = filters.dir === 'desc' ? desc(orderColumn) : asc(orderColumn);

  const rows = db
    .select({ status: bookUserStatus, book: books })
    .from(bookUserStatus)
    .innerJoin(books, eq(books.id, bookUserStatus.bookId))
    .where(where)
    .orderBy(order, asc(books.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookUserStatus)
    .innerJoin(books, eq(books.id, bookUserStatus.bookId))
    .where(where);

  const { items, total } = await paginate(rows, countQuery);
  const authorsByBook = await authorsByBookIds(
    db,
    items.map((r) => r.book.id),
  );
  return {
    items: items.map((row) => ({
      book: toBookSummary(row.book, authorsByBook),
      status: toUserBookStatus(row.status),
    })),
    total,
  };
}
