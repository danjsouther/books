import type { ActivityFeed, ActivityItem, ActivityListQuery } from '@books/domain';
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { activity } from '../schema/activity';
import { books } from '../schema/books';
import { users } from '../schema/users';

/**
 * Keyset-paginated on `id`, never offset — the feed is written to continuously, and
 * offset pagination is exactly where that duplicates or drops rows as new ones land
 * between pages. `id` is a `bigserial`, so `id < before` is a stable, monotonic cursor.
 *
 * Fetches `limit + 1` rows and trims the extra one: its presence, not a second count
 * query, is what `nextCursor` is derived from.
 */
export async function listActivity(db: Db, filters: ActivityListQuery): Promise<ActivityFeed> {
  const clauses: (SQL | undefined)[] = [];
  if (filters.kind !== undefined) clauses.push(eq(activity.kind, filters.kind));
  if (filters.actorId !== undefined) clauses.push(eq(activity.actorId, filters.actorId));
  if (filters.bookId !== undefined) clauses.push(eq(activity.bookId, filters.bookId));
  if (filters.before !== undefined) clauses.push(lt(activity.id, filters.before));
  const where = and(...clauses);

  const rows = await db
    .select({
      id: activity.id,
      kind: activity.kind,
      payload: activity.payload,
      createdAt: activity.createdAt,
      actorId: users.id,
      actorUsername: users.username,
      bookId: books.id,
      bookTitle: books.title,
      bookSlug: books.slug,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .leftJoin(books, eq(books.id, activity.bookId))
    .where(where)
    .orderBy(desc(activity.id))
    .limit(filters.limit + 1);

  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;

  const items: ActivityItem[] = page.map((row) => ({
    id: row.id,
    kind: row.kind,
    actor:
      row.actorId === null || row.actorUsername === null
        ? null
        : { id: row.actorId, username: row.actorUsername },
    book:
      row.bookId === null || row.bookTitle === null || row.bookSlug === null
        ? null
        : { id: row.bookId, title: row.bookTitle, slug: row.bookSlug },
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}
