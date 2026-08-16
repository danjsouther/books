import { z } from 'zod';
import { ListQuerySchema } from './list';

export const CHANGE_KINDS = ['created', 'edited', 'deleted', 'restored', 'reverted'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Response item of `GET /books/:id/revisions` (and the series equivalent) — no
 *  `snapshot`, since shipping every version's full state on the list view would be
 *  wasteful when only one is usually opened. */
export interface RevisionSummary {
  readonly version: number;
  readonly changeKind: ChangeKind;
  readonly changedBy: string | null;
  readonly changedAt: string;
  readonly note: string | null;
}

/** Response body of `GET /books/:id/revisions/:v` — the full snapshot. */
export interface Revision extends RevisionSummary {
  readonly snapshot: unknown;
}

export const RevisionListQuerySchema = ListQuerySchema.extend({
  actorId: z.string().uuid().optional(),
  changeKind: z.enum(CHANGE_KINDS).optional(),
});
export type RevisionListQuery = z.infer<typeof RevisionListQuerySchema>;

export const RevisionDiffQuerySchema = z.object({
  against: z.coerce.number().int().positive(),
});
export type RevisionDiffQuery = z.infer<typeof RevisionDiffQuerySchema>;

/** Request body of `POST /books/:id/revert`. */
export const RevertRequestSchema = z.object({
  toVersion: z.coerce.number().int().positive(),
  note: z.string().nullable().optional(),
});
export type RevertRequest = z.infer<typeof RevertRequestSchema>;
