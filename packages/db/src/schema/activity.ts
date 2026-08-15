import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { activityKind } from './enums';
import { books } from './books';
import { users } from './users';

/**
 * Append-only, backing the *user activity* feed only — never the changes feed,
 * which is a query over the revision tables.
 *
 * Every row is written in the same transaction as the action it records, so the
 * feed can never disagree with the data. The primary key is a `bigserial` rather
 * than a uuid because the feed is strictly reverse-chronological and a monotonic
 * integer gives stable keyset pagination for free.
 */
export const activity = pgTable(
  'activity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: activityKind('kind').notNull(),
    /** Null for system events — `book.released` has no actor. */
    actorId: uuid('actor_id').references(() => users.id),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'cascade' }),
    /** `{ from, to }` for status and rating changes. */
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_created_at_idx').on(t.createdAt.desc(), t.id.desc()),
    index('activity_actor_idx').on(t.actorId),
    index('activity_book_idx').on(t.bookId),
    /** The second of two independent guards against double-announcing a release;
     *  the first is `books.released_announced_at`. A feed that says a book came
     *  out twice because the server restarted is embarrassing, so it is worth
     *  making impossible rather than unlikely. */
    uniqueIndex('activity_released_once_idx')
      .on(t.kind, t.bookId)
      .where(sql`kind = 'book.released'`),
  ],
);
