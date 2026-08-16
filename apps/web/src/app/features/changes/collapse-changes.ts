import type { ChangeItem } from '@books/domain';

const COLLAPSE_WINDOW_MS = 60 * 60 * 1000;

export interface CollapsedChange extends ChangeItem {
  readonly count: number;
  /** One below the earliest version in the group — what "Revert" targets to
   *  undo the whole run of collapsed edits, not just the most recent one. */
  readonly oldestVersion: number;
}

/**
 * Collapses consecutive same-actor, same-entity `edited` rows within a
 * one-hour window into one row, so someone tidying twenty books doesn't
 * produce twenty rows. Pairwise/adjacent, not a sliding window over the
 * whole page — "consecutive" is taken literally: a same-actor edit
 * separated by another entity's row in between does not merge with an
 * earlier one, even if both fall inside an hour of each other.
 *
 * Pure and independent of any `computed()`/component wiring so the rule
 * itself is unit-testable — the server stays dumb, per the master plan.
 * Expects `items` already sorted newest-first (`GET /changes`' own order).
 */
export function collapseChanges(items: readonly ChangeItem[]): CollapsedChange[] {
  const result: CollapsedChange[] = [];

  for (const item of items) {
    const last = result[result.length - 1];
    const mergeable =
      last !== undefined &&
      item.changeKind === 'edited' &&
      last.changeKind === 'edited' &&
      last.entityType === item.entityType &&
      last.entityId === item.entityId &&
      last.actorId === item.actorId &&
      Math.abs(new Date(last.changedAt).getTime() - new Date(item.changedAt).getTime()) <=
        COLLAPSE_WINDOW_MS;

    if (mergeable && last !== undefined) {
      result[result.length - 1] = {
        ...last,
        count: last.count + 1,
        oldestVersion: item.version - 1,
        changedFields: Array.from(new Set([...last.changedFields, ...item.changedFields])),
      };
    } else {
      result.push({ ...item, count: 1, oldestVersion: item.version - 1 });
    }
  }

  return result;
}
