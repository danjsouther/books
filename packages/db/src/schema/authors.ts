import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * A lookup table, not a catalog record: no version, no soft delete, no revisions.
 * A book's *authorship* is versioned through the book, which snapshots the resolved
 * set on every write — it is the author's name itself that carries no history.
 *
 * Names are unique case-insensitively, unlike series names. The asymmetry is
 * deliberate: an author is an **identity** that books are linked to and filtered by,
 * so two rows for one person is a defect. A series name is a **label** on a grouping,
 * where a duplicate is a cosmetic annoyance a friend group can sort out themselves.
 */
export const authors = pgTable(
  'authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /** An expression index rather than a generated column plus a named constraint:
     *  nothing needs `ON CONFLICT ON CONSTRAINT` here, and this doubles as the lookup
     *  index for `resolveAuthors` and for author autocomplete. */
    uniqueIndex('authors_name_lower_key').on(sql`lower(name)`),
  ],
);
