import { z } from 'zod';
import { ListQuerySchema, booleanQueryParam } from './list';

export const SeriesCreateSchema = z.object({
  name: z.string().min(1),
  /** "The Expanse" → "Expanse, The", for sorting. Falls back to `name` when unset. */
  sortName: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
});
export type SeriesCreate = z.infer<typeof SeriesCreateSchema>;

/** See the comment on `BookUpdateSchema` — deliberately not
 *  `SeriesCreateSchema.partial()`, for the same reason: every create field carries a
 *  `.default(...)` that Zod would apply to an absent PATCH key. */
export const SeriesUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  sortName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type SeriesUpdate = z.infer<typeof SeriesUpdateSchema>;

export const SeriesListQuerySchema = ListQuerySchema.extend({
  q: z.string().optional(),
  hasUpcoming: booleanQueryParam.optional(),
  includeDeleted: booleanQueryParam.default(false),
  sort: z.enum(['name', 'bookCount', 'nextRelease']).default('name'),
});
export type SeriesListQuery = z.infer<typeof SeriesListQuerySchema>;

export interface SeriesSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sortName: string | null;
  readonly bookCount: number;
  readonly nextRelease: string | null;
  readonly version: number;
  readonly deletedAt: string | null;
}

export interface SeriesDetail extends SeriesSummary {
  readonly description: string | null;
  readonly deletedBy: string | null;
}

export const SeriesBooksQuerySchema = ListQuerySchema.extend({
  status: z.string().optional(),
  hasDate: booleanQueryParam.optional(),
  sort: z.enum(['position', 'release', 'title']).default('position'),
});
export type SeriesBooksQuery = z.infer<typeof SeriesBooksQuerySchema>;
