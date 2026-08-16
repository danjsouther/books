/**
 * Runs a page of rows and its matching count query in parallel. Every caller builds
 * its own filtered/sorted query — this only owns the "run both, shape the result"
 * part that would otherwise be repeated identically in every list query.
 *
 * `/activity` does not use this: it is keyset-paginated on `id`, not offset, for the
 * reason recorded on `queries/activity.ts`.
 */
export async function paginate<T>(
  rows: Promise<T[]>,
  countQuery: Promise<{ count: number }[]>,
): Promise<{ items: T[]; total: number }> {
  const [items, countRows] = await Promise.all([rows, countQuery]);
  return { items, total: countRows[0]?.count ?? 0 };
}
