import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { releasePrecision } from './enums';
import { series } from './series';
import { users } from './users';

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),

    /** Authorship lives in `author_books`, not here. See `docs/data-model.md`. */

    /** Nullable — standalones exist. */
    seriesId: uuid('series_id').references(() => series.id),
    /** Decimals are required: `1.5` is the universal novella convention.
     *  `numeric` rather than `real` for exact ordering with no float surprises.
     *  Deliberately NOT unique — two 1.5 novellas is a real thing. */
    seriesPosition: numeric('series_position', { precision: 6, scale: 2 }),

    /** `date`, never `timestamptz`: a release date is a calendar fact, not an
     *  instant, and `timestamptz` produces the classic off-by-one where a US
     *  reader sees the previous day. Always stores the EARLIEST instant
     *  consistent with what is known — year-only 2027 is `2027-01-01`. */
    releaseDate: date('release_date'),
    releasePrecision: releasePrecision('release_precision').notNull().default('unknown'),
    /** Stamped by the nightly release job; its presence is what makes that job
     *  idempotent across restarts. */
    releasedAnnouncedAt: timestamp('released_announced_at', { withTimezone: true }),

    pageCount: integer('page_count'),
    /** The catalog is Amazon-sourced, so this is an ASIN rather than an ISBN. Ten
     *  characters covers Amazon's own ASINs and the ISBN-10s it uses as the ASIN for
     *  most books — including the trailing `X` an ISBN-10 check digit can carry.
     *  Nullable, so a book with no Amazon page can still be added by hand. */
    asin: text('asin'),
    /** An external URL. Uploads are a TODO. */
    coverUrl: text('cover_url'),
    /** A link to the book's own page — "buy it here" / "source page" — distinct from
     *  `coverUrl` (image src only) and `asin` (a product code, not a link). Lets a
     *  hand-added book with no ASIN still carry a place to find it. */
    url: text('url'),

    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id),

    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Live rows only. `asin` is nullable and Postgres treats NULLs as distinct, so
     *  any number of hand-added books may carry no ASIN at all — duplicate detection
     *  only protects the ones that have one. */
    uniqueIndex('books_live_asin_key')
      .on(t.asin)
      .where(sql`deleted_at IS NULL`),

    /** Precision and date must agree in both directions, so neither a dated
     *  'unknown' nor an undated 'day' can exist. */
    check(
      'books_release_precision_date_agree',
      sql`(${t.releasePrecision} = 'unknown') = (${t.releaseDate} IS NULL)`,
    ),
    check('books_page_count_positive', sql`${t.pageCount} IS NULL OR ${t.pageCount} > 0`),
    check('books_asin_format', sql`${t.asin} IS NULL OR ${t.asin} ~ '^[A-Z0-9]{10}$'`),
    check('books_url_scheme', sql`${t.url} IS NULL OR ${t.url} ~* '^https?://'`),

    index('books_series_id_idx').on(t.seriesId),
    index('books_release_date_idx').on(t.releaseDate),
    index('books_deleted_at_idx').on(t.deletedAt),
  ],
);
