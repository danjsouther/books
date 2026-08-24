import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  primaryKey,
  smallint,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookStatus } from './enums';
import { books } from './books';
import { users } from './users';

/**
 * One user's relationship with one book. Rating lives here rather than in its own
 * table because it is an attribute of that relationship, strictly 1:1 with
 * `(user, book)` — which makes the detail page's "everyone's take" panel a single
 * indexed scan with no join, and `PATCH /books/:id/me` a single upsert. Rating
 * history is not lost either: `rating.changed` activity rows carry `from`/`to`.
 *
 * `percentRead` and `publicNote` are visible to any member, same as `rating` —
 * they ride along in the "everyone's take" panel. `note` is private to its owner
 * and must never be selected into a query result that isn't scoped to the caller's
 * own row (see `PublicBookStatus` vs `UserBookStatus` in `@books/domain`).
 *
 * **This is the one table with a hard delete.** Removing a book from your shelf
 * really removes the row — soft-deleting would collide with the composite primary
 * key and make the upsert path meaningfully worse. Unlike catalog data it is your
 * own row, recreatable in one click, and the activity log keeps the trail.
 */
export const bookUserStatus = pgTable(
  'book_user_status',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: bookStatus('status').notNull().default('backlog'),
    /** Nullable, meaning *unrated*. `0` is a legitimate score distinct from "no
     *  opinion", which is exactly why this is a nullable integer and not a
     *  sentinel value. */
    rating: smallint('rating'),
    /** How far into the book this member has gotten, 0–100. Nullable meaning no
     *  progress has been recorded — public, like `rating`. */
    percentRead: smallint('percent_read'),
    /** Private to its owner. Never select this column into a query result unless
     *  it is scoped to the requesting viewer's own row. */
    note: text('note'),
    /** Same visibility as `rating`/`percentRead` — shown to any member. */
    publicNote: text('public_note'),
    startedAt: date('started_at'),
    finishedAt: date('finished_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.userId] }),
    check(
      'book_user_status_rating_range',
      sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 0 AND 10`,
    ),
    check(
      'book_user_status_percent_read_range',
      sql`${t.percentRead} IS NULL OR ${t.percentRead} BETWEEN 0 AND 100`,
    ),
    check(
      'book_user_status_dates_ordered',
      sql`${t.finishedAt} IS NULL OR ${t.startedAt} IS NULL OR ${t.finishedAt} >= ${t.startedAt}`,
    ),
    index('book_user_status_user_status_idx').on(t.userId, t.status),
    index('book_user_status_book_idx').on(t.bookId),
  ],
);
