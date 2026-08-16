import { z } from 'zod';

/** What people *do*, not what the catalog *becomes* — edits/deletes/restores/reverts
 *  already have an authoritative home in the revision tables. `book.added` appears in
 *  both framings deliberately: a social act here, and version 1 in the change log. */
export const ACTIVITY_KINDS = [
  'book.added',
  'status.changed',
  'rating.changed',
  'shelf.removed',
  'book.released',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Response item of `GET /activity`. Actor and book are embedded, hydrated, so the
 *  feed renders with no follow-up request per row. */
export interface ActivityItem {
  readonly id: number;
  readonly kind: ActivityKind;
  /** `null` for system events — `book.released` has no actor. */
  readonly actor: { readonly id: string; readonly username: string } | null;
  readonly book: { readonly id: string; readonly title: string } | null;
  /** `{ from, to }` for status and rating changes. */
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export const ActivityListQuerySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).optional(),
  actorId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  /** Keyset cursor: the `id` of the last item already seen. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;

/** Response body of `GET /activity`. Keyset-paginated on `id`, never offset — a feed
 *  with rows arriving during paging is exactly where offset pagination duplicates
 *  and drops items. */
export interface ActivityFeed {
  readonly items: ActivityItem[];
  readonly nextCursor: number | null;
}
