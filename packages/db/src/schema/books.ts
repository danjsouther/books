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

    /** Not a normalized table. A handful of friends entering books by hand does
     *  not justify an autocomplete UI, a merge tool, and a dedup problem; the GIN
     *  index below makes filtering fast, and promoting this to an `authors` table
     *  later is mechanical (tracked in docs/TODO.md). */
    authors: text('authors')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

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
    isbn13: text('isbn13'),
    /** An external URL. Uploads are a TODO. */
    coverUrl: text('cover_url'),

    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id),

    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Live rows only, same as series. `isbn13` is nullable and Postgres treats
     *  NULLs as distinct, so any number of books may carry no ISBN at all. */
    uniqueIndex('books_live_isbn13_key')
      .on(t.isbn13)
      .where(sql`deleted_at IS NULL`),

    /** Precision and date must agree in both directions, so neither a dated
     *  'unknown' nor an undated 'day' can exist. */
    check(
      'books_release_precision_date_agree',
      sql`(${t.releasePrecision} = 'unknown') = (${t.releaseDate} IS NULL)`,
    ),
    check('books_page_count_positive', sql`${t.pageCount} IS NULL OR ${t.pageCount} > 0`),
    check('books_isbn13_format', sql`${t.isbn13} IS NULL OR ${t.isbn13} ~ '^[0-9]{13}$'`),

    index('books_authors_idx').using('gin', t.authors),
    index('books_series_id_idx').on(t.seriesId),
    index('books_release_date_idx').on(t.releaseDate),
    index('books_deleted_at_idx').on(t.deletedAt),
  ],
);
