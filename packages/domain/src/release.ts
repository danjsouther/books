import { z } from 'zod';
import type { BookSummary } from './book';
import { booleanQueryParam } from './list';

export const ReleaseListQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  includeUndated: booleanQueryParam.default(false),
  /** Restricts to books the viewer has marked `plan` — "my upcoming releases". */
  mine: booleanQueryParam.default(false),
  seriesId: z.string().uuid().optional(),
});
export type ReleaseListQuery = z.infer<typeof ReleaseListQuerySchema>;

/** Response body of `GET /releases`. Pre-split by precision so the calendar and the
 *  release list can consume the identical payload without re-deriving the split
 *  client-side — the server is where precision semantics live. */
export interface ReleasesResponse {
  readonly dated: BookSummary[];
  readonly monthly: BookSummary[];
  readonly yearly: BookSummary[];
  readonly undated: BookSummary[];
  readonly window: { readonly from: string; readonly to: string };
}
