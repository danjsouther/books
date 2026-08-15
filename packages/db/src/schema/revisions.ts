import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { changeKind } from './enums';
import { books } from './books';
import { series } from './series';
import { users } from './users';

/**
 * Append-only. Every mutation of a catalog record appends exactly one row here,
 * so the current row always agrees with the highest-version revision — both are
 * written in the same transaction.
 *
 * The snapshot is the *complete record after the change*, not a diff. Rows are
 * small, restore-to-version becomes a trivial write, and diffing is a pure
 * function in `@books/domain` computed on demand for display.
 */
export const bookRevisions = pgTable(
  'book_revisions',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    changeKind: changeKind('change_kind').notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.version] }),
    index('book_revisions_changed_at_idx').on(t.changedAt.desc()),
    index('book_revisions_changed_by_idx').on(t.changedBy),
  ],
);

export const seriesRevisions = pgTable(
  'series_revisions',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    changeKind: changeKind('change_kind').notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.seriesId, t.version] }),
    index('series_revisions_changed_at_idx').on(t.changedAt.desc()),
    index('series_revisions_changed_by_idx').on(t.changedBy),
  ],
);
