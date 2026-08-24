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
    /** Generated once at creation from `name` and never regenerated — a stable
     *  permalink, same contract as `id`. See `docs/data-model.md`. */
    slug: text('slug').notNull(),
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
    /** Series names are deliberately NOT unique. A series name is a label on a
     *  grouping rather than an identity, so a duplicate is a cosmetic annoyance a
     *  friend group can sort out — and enforcing it would cost an advisory lock, a
     *  duplicate check on every write, and a restore that can fail. Contrast
     *  `authors`, where the name IS the identity and uniqueness earns its keep. */
    index('series_name_lower_idx').on(sql`lower(name)`),
    index('series_deleted_at_idx').on(t.deletedAt),
    /** Global, unlike series names — a soft-deleted series still needs a
     *  resolvable URL for `/trash` and for historical `/changes` entries. See
     *  `docs/data-model.md`. */
    uniqueIndex('series_slug_key').on(t.slug),
  ],
);
