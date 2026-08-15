import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * A series has no author column. Co-authored and ghost-continued series are the
 * norm, so authorship lives on books.
 */
export const series = pgTable(
  'series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Generated, not written. Case-insensitive uniqueness and case-insensitive
     *  lookups both key off this, so neither has to repeat `lower(name)` and risk
     *  writing it differently in one place. */
    nameLower: text('name_lower')
      .notNull()
      .generatedAlwaysAs(sql`lower(name)`),
    /** "The Expanse" → "Expanse, The", for sorting. Nullable; falls back to `name`. */
    sortName: text('sort_name'),
    description: text('description'),

    /** Bumped by EVERY mutation, deletions included, and doubling as the
     *  optimistic-concurrency token. See `docs/data-model.md`. */
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id),

    /** Attribution only — full-wiki permissions mean no authorization check ever
     *  reads these. */
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Scoped to live rows, which is the invariant that actually matters: no two
     *  *live* series may share a name, and any number of trashed ones may. See
     *  `docs/data-model.md` for why the version-keyed alternative does not work.
     *  This is a backstop — the authoritative check happens inside the mutation
     *  helper's transaction, under an advisory lock, because that is where a
     *  readable error message can come from. */
    uniqueIndex('series_live_name_key')
      .on(t.nameLower)
      .where(sql`deleted_at IS NULL`),
    index('series_deleted_at_idx').on(t.deletedAt),
  ],
);
