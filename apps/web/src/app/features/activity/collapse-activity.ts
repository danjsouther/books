import type { ActivityItem } from '@books/domain';

export interface CollapsedActivityItem extends ActivityItem {
  readonly count: number;
}

const COLLAPSIBLE_KINDS = new Set(['status.changed', 'rating.changed']);

/**
 * Collapses `status.changed`/`rating.changed` rows to at most one per
 * (actor, book, UTC calendar day) — regardless of what else is interleaved
 * between them, unlike `collapseChanges`' adjacent-only merge, since the
 * point here is "one entry a day for this book", not "one entry per burst
 * of activity". `book.added`/`shelf.removed`/`book.released` always pass
 * through untouched, one row each.
 *
 * Pure and independent of any `computed()`/component wiring, same as
 * `collapseChanges` — the rule itself stays unit-testable in isolation.
 * Expects `items` already sorted newest-first (`GET /activity`'s own order).
 */
export function collapseActivity(items: readonly ActivityItem[]): CollapsedActivityItem[] {
  const result: CollapsedActivityItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    if (!COLLAPSIBLE_KINDS.has(item.kind) || item.actor === null || item.book === null) {
      result.push({ ...item, count: 1 });
      continue;
    }

    const day = item.createdAt.slice(0, 10);
    const key = `${item.kind}:${item.actor.id}:${item.book.id}:${day}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push({ ...item, count: 1 });
      continue;
    }

    // `item` is older than what's already kept (items arrive newest-first),
    // so it only extends the visible "was X" back to the start of the day's
    // run — the kept row's own `to`/`createdAt` (the most recent occurrence)
    // stay as they are.
    const existing = result[existingIndex]!;
    result[existingIndex] = {
      ...existing,
      count: existing.count + 1,
      payload: { ...existing.payload, from: item.payload['from'] },
    };
  }

  return result;
}
