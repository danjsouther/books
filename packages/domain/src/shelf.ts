import { z } from 'zod';

/** `plan` and `backlog` are not the same shelf: `plan` is anticipation (usually not
 *  out yet), `backlog` is availability (out, unstarted). See `schema/enums.ts` for
 *  the full rationale — this is the wire-format mirror of that enum. */
export const BOOK_STATUSES = ['plan', 'backlog', 'reading', 'completed', 'dropped'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** One member's relationship with one book — response shape of `GET /books/:id/me`
 *  and the `statuses`/`myStatus` fields on `BookDetail`. */
export interface UserBookStatus {
  readonly bookId: string;
  readonly userId: string;
  readonly status: BookStatus;
  /** `null` means unrated — `0` is a real score, distinct from "no opinion". */
  readonly rating: number | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly updatedAt: string;
}

/** Request body of `PATCH /books/:id/me`. Every field is independently optional —
 *  `rating: null` explicitly clears it, `rating` omitted leaves it alone, which is
 *  why this is `.optional()` rather than `.nullable().default(null)`. */
export const ShelfUpdateSchema = z.object({
  status: z.enum(BOOK_STATUSES).optional(),
  rating: z.number().int().min(0).max(10).nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});
export type ShelfUpdate = z.infer<typeof ShelfUpdateSchema>;
