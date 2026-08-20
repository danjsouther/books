import type { ActivityItem, ActivityKind } from '@books/domain';

export interface CollapsedActivityItem extends ActivityItem {
  readonly count: number;
}

/** `status.changed` and `shelf.removed` are the same story — "what is this
 *  member's shelf state for this book today" — so they share one group key
 *  and collapse together. `rating.changed` is an orthogonal dimension
 *  (a book can be re-rated without touching its status) and gets its own
 *  group. `book.added`/`book.released` aren't per-member shelf state at
 *  all and always pass through untouched. */
const GROUP_BY_KIND: Partial<Record<ActivityKind, string>> = {
  'status.changed': 'shelf-state',
  'shelf.removed': 'shelf-state',
  'rating.changed': 'rating',
};

/**
 * Collapses shelf-state (`status.changed`/`shelf.removed`) and, separately,
 * `rating.changed` rows to at most one row per (actor, book, UTC calendar
 * day, group) — regardless of what else is interleaved between them, unlike
 * `collapseChanges`' adjacent-only merge, since the point here is "one entry
 * a day for this book", not "one entry per burst of activity". Repeatedly
 * setting, clearing, and resetting a status within one day — e.g. clicking
 * through the status picker's deselect-to-remove toggle a few times — is
 * still one line, not one line per click. `book.added`/`book.released`
 * always pass through untouched, one row each.
 *
 * The kept row is always the newest event in the group (its `kind`/payload
 * are what renders), with `count` counting every event folded into it. The
 * "was X" chain in `payload.from` only extends across a run of the *same*
 * kind — a `shelf.removed` on either side of a `status.changed` breaks that
 * continuity (there's no "from" a removed shelf entry has), so it just adds
 * to the count without touching the kept row's payload.
 *
 * Pure and independent of any `computed()`/component wiring, same as
 * `collapseChanges` — the rule itself stays unit-testable in isolation.
 * Expects `items` already sorted newest-first (`GET /activity`'s own order).
 */
export function collapseActivity(items: readonly ActivityItem[]): CollapsedActivityItem[] {
  const result: CollapsedActivityItem[] = [];
  const indexByKey = new Map<string, number>();
  // The kept row's own `kind` is fixed at the newest event in the group, so
  // it can't tell a same-kind run from one broken by a different kind in
  // between — this tracks the kind of whichever event was most recently
  // folded in, so that check is about true chronological adjacency.
  const lastKindByKey = new Map<string, ActivityKind>();

  for (const item of items) {
    const group = GROUP_BY_KIND[item.kind];
    if (group === undefined || item.actor === null || item.book === null) {
      result.push({ ...item, count: 1 });
      continue;
    }

    const day = item.createdAt.slice(0, 10);
    const key = `${group}:${item.actor.id}:${item.book.id}:${day}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      lastKindByKey.set(key, item.kind);
      result.push({ ...item, count: 1 });
      continue;
    }

    // `item` is older than what's already kept (items arrive newest-first).
    // An adjacent same-kind run extends the visible "was X" back to the
    // start of the run — the kept row's own `kind`/`to`/`createdAt` (the
    // most recent occurrence) stay as they are either way.
    const existing = result[existingIndex]!;
    const adjacentSameKind = lastKindByKey.get(key) === item.kind;
    result[existingIndex] = {
      ...existing,
      count: existing.count + 1,
      payload: adjacentSameKind
        ? { ...existing.payload, from: item.payload['from'] }
        : existing.payload,
    };
    lastKindByKey.set(key, item.kind);
  }

  return result;
}
