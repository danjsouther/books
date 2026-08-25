import { z } from 'zod';

/** `plan` and `backlog` are not the same shelf: `plan` is anticipation (usually not
 *  out yet), `backlog` is availability (out, unstarted). See `schema/enums.ts` for
 *  the full rationale — this is the wire-format mirror of that enum. */
export const BOOK_STATUSES = [
  'plan',
  'backlog',
  'reading',
  'set_aside',
  'completed',
  'dropped',
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** Fields of the user/book relationship visible to any member, not just its
 *  owner — the shape of `BookDetail.statuses` entries and `GET /users/:id/shelf`
 *  entries, both of which may be read by someone other than the row's owner. */
export interface PublicBookStatus {
  readonly bookId: string;
  readonly userId: string;
  readonly status: BookStatus;
  /** `null` means unrated — `0` is a real score, distinct from "no opinion". */
  readonly rating: number | null;
  /** How far into the book this member has gotten, 0–100. `null` means no
   *  progress recorded. */
  readonly percentRead: number | null;
  /** A short public comment — visible to any member, unlike `note` below. */
  readonly publicNote: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly updatedAt: string;
}

/** One member's own relationship with one book — response shape of
 *  `GET /books/:id/me` and `BookDetail.myStatus`. Adds the private note on top of
 *  `PublicBookStatus`; nothing that isn't scoped to the row's own owner should ever
 *  be built from this type — use `PublicBookStatus` there instead. */
export interface UserBookStatus extends PublicBookStatus {
  /** Private to its owner — never shown to anyone else. */
  readonly note: string | null;
}

/** Request body of `PATCH /books/:id/me`. Every field is independently optional —
 *  `rating: null` explicitly clears it, `rating` omitted leaves it alone, which is
 *  why this is `.optional()` rather than `.nullable().default(null)`. */
export const ShelfUpdateSchema = z.object({
  status: z.enum(BOOK_STATUSES).optional(),
  rating: z.number().int().min(0).max(10).nullable().optional(),
  percentRead: z.number().int().min(0).max(100).nullable().optional(),
  note: z.string().nullable().optional(),
  publicNote: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});
export type ShelfUpdate = z.infer<typeof ShelfUpdateSchema>;
