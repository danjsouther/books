/** One field's change between two revision snapshots. */
export interface FieldDiff {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** Bookkeeping columns that change on every write regardless of what the member
 *  actually edited — including them would swamp every diff with noise instead of
 *  showing what changed. */
const IGNORED_FIELDS = new Set(['version', 'updatedAt', 'updatedBy']);

/** A shallow, field-by-field diff between two revision snapshots. Order-sensitive
 *  fields like `authors` are compared by serialised equality rather than deep
 *  structural equality, which is enough to detect a change without needing a
 *  bespoke comparator per field. */
export function diffSnapshots(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: FieldDiff[] = [];
  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue;
    const beforeValue = before[field];
    const afterValue = after[field];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      diffs.push({ field, before: beforeValue, after: afterValue });
    }
  }
  return diffs;
}
