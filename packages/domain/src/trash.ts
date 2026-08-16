import { z } from 'zod';
import { ListQuerySchema } from './list';

/** Response item of `GET /trash` — a union over soft-deleted books and series,
 *  normalised to one shape so the trash page renders both from a single list. */
export interface TrashItem {
  readonly id: string;
  readonly type: 'book' | 'series';
  readonly title: string;
  readonly deletedAt: string;
  readonly deletedBy: string | null;
}

export const TrashListQuerySchema = ListQuerySchema.extend({
  type: z.enum(['book', 'series']).optional(),
  q: z.string().optional(),
  deletedBy: z.string().uuid().optional(),
  sort: z.enum(['deletedAt', 'title']).default('deletedAt'),
});
export type TrashListQuery = z.infer<typeof TrashListQuerySchema>;
