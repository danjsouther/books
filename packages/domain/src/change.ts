import { z } from 'zod';
import { CHANGE_KINDS } from './revision';
import { ListQuerySchema } from './list';
import type { ChangeKind } from './revision';

export type EntityType = 'book' | 'series';

/** Response item of `GET /changes` — a union over both revision tables, one row per
 *  version. `changedFields` is computed against the immediately preceding version so
 *  the feed can say "3 fields changed" without shipping two full snapshots per row;
 *  the full diff stays behind `/revisions/:v/diff`. */
export interface ChangeItem {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly entitySlug: string;
  readonly version: number;
  readonly changeKind: ChangeKind;
  readonly actorId: string | null;
  readonly changedAt: string;
  readonly title: string;
  readonly changedFields: string[];
}

export const ChangeListQuerySchema = ListQuerySchema.extend({
  entityType: z.enum(['book', 'series']).optional(),
  changeKind: z.enum(CHANGE_KINDS).optional(),
  actorId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  since: z.string().optional(),
});
export type ChangeListQuery = z.infer<typeof ChangeListQuerySchema>;
