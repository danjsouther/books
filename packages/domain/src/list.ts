import { z } from 'zod';

/** The envelope every collection endpoint returns. `total` is the count ignoring
 *  `page`/`pageSize`, so the client can render "127 books" and page controls from
 *  one response. */
export interface ListResponse<T> {
  readonly items: T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** The params every collection endpoint accepts. Resources extend this with their
 *  own filters and narrow `sort` to the columns they actually support — this base
 *  schema only fixes the shape all of them share. */
export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

/** Not `z.coerce.boolean()` — that runs `Boolean(x)`, so the literal string
 *  `"false"` (what `HttpParams` sends for a JS `false`) coerces to `true`.
 *  A boolean query param only ever arrives as an actual boolean (in-process
 *  callers) or the string `"true"`/`"false"` (HTTP query params), so match
 *  those exactly instead. */
export const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');
