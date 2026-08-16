import { z } from 'zod';
import { BOOK_STATUSES } from './shelf';
import { ListQuerySchema } from './list';
import type { UserBookStatus } from './shelf';

/** How much of a release date is actually known. See `docs/data-model.md`. */
export const RELEASE_PRECISIONS = ['day', 'month', 'year', 'unknown'] as const;
export type ReleasePrecision = (typeof RELEASE_PRECISIONS)[number];

/** An author as credited on a book, in credited order. */
export interface AuthorRef {
  readonly id: string;
  readonly name: string;
}

/** Request body of `POST /books`. */
export const BookCreateSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  /** Names, in credited order — resolved to author rows on write. */
  authors: z.array(z.string().min(1)).default([]),
  seriesId: z.string().uuid().nullable().default(null),
  /** A decimal string: `'1.5'` is the universal novella convention. */
  seriesPosition: z.string().nullable().default(null),
  /** `YYYY-MM-DD`, always the earliest date consistent with `releasePrecision`. */
  releaseDate: z.string().nullable().default(null),
  releasePrecision: z.enum(RELEASE_PRECISIONS).default('unknown'),
  pageCount: z.number().int().positive().nullable().default(null),
  asin: z.string().nullable().default(null),
  coverUrl: z.string().nullable().default(null),
});
export type BookCreate = z.infer<typeof BookCreateSchema>;

/**
 * Request body of `PATCH /books/:id`. Deliberately NOT `BookCreateSchema.partial()`:
 * every field on the create schema carries a `.default(...)`, and Zod applies a
 * field's default whenever the key is absent regardless of `.partial()` — so a patch
 * that only sends `{ title }` would silently reset every other field, `authors`
 * included, back to its create-time default instead of leaving it alone. Every field
 * here is `.optional()` with no default, so "absent" means "unchanged", which is the
 * whole point of a patch.
 *
 * `expectedVersion` is required, not optional — a patch with no opinion on
 * concurrency is exactly the bug this field exists to prevent.
 */
export const BookUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  authors: z.array(z.string().min(1)).optional(),
  seriesId: z.string().uuid().nullable().optional(),
  seriesPosition: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  releasePrecision: z.enum(RELEASE_PRECISIONS).optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  asin: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type BookUpdate = z.infer<typeof BookUpdateSchema>;

export const BookListQuerySchema = ListQuerySchema.extend({
  q: z.string().optional(),
  seriesId: z.string().uuid().optional(),
  author: z.string().optional(),
  status: z.enum(BOOK_STATUSES).optional(),
  ratedBy: z.string().uuid().optional(),
  releasedFrom: z.string().optional(),
  releasedTo: z.string().optional(),
  hasDate: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['title', 'release', 'created', 'updated', 'rating']).default('title'),
});
export type BookListQuery = z.infer<typeof BookListQuerySchema>;

/** Response item of `GET /books` and embedded wherever a book is listed elsewhere
 *  (releases, a series' books, a member's shelf). */
export interface BookSummary {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly authors: AuthorRef[];
  readonly seriesId: string | null;
  readonly seriesPosition: string | null;
  readonly releaseDate: string | null;
  readonly releasePrecision: ReleasePrecision;
  readonly asin: string | null;
  readonly coverUrl: string | null;
  readonly version: number;
  readonly deletedAt: string | null;
}

export interface RatingSummary {
  readonly average: number | null;
  readonly count: number;
  /** Index `i` is the count of ratings equal to `i`, for `i` in `0..10`. */
  readonly distribution: number[];
}

/** Response body of `GET /books/:id`. Embeds everything the detail page needs so it
 *  paints from one request, including a deleted book — which renders as a tombstone
 *  with a Restore button rather than a 404. */
export interface BookDetail extends BookSummary {
  readonly description: string | null;
  readonly pageCount: number | null;
  readonly deletedBy: string | null;
  readonly myStatus: UserBookStatus | null;
  readonly statuses: UserBookStatus[];
  readonly ratingSummary: RatingSummary;
}
