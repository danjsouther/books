import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * `plan` and `backlog` are not the same shelf and the UI must never blur them.
 * `plan` is anticipation — you want it, and usually it is not out yet. `backlog`
 * is availability — you can read it and have not started. The distinction earns
 * its keep on the calendar, where "my upcoming releases" means `plan`
 * specifically, and in `book.released`, which is only interesting to people who
 * planned to read the book.
 */
export const bookStatus = pgEnum('book_status', [
  'plan',
  'backlog',
  'reading',
  'set_aside',
  'completed',
  'dropped',
]);

/** How much of a release date is actually known. See `docs/data-model.md`. */
export const releasePrecision = pgEnum('release_precision', ['day', 'month', 'year', 'unknown']);

export const tokenClient = pgEnum('token_client', ['web', 'desktop', 'service']);

export const changeKind = pgEnum('change_kind', [
  'created',
  'edited',
  'deleted',
  'restored',
  'reverted',
]);

/**
 * What people *do*, not what the catalog *becomes*. Edits, deletions,
 * restorations, and reverts are changes, and they already have an authoritative
 * home in the revision tables — recording them here as well would be duplicate
 * bookkeeping that can drift. `book.added` is the one event that appears in both
 * framings, deliberately: a social act in the activity feed, and version 1 in the
 * change log.
 */
export const activityKind = pgEnum('activity_kind', [
  'book.added',
  'status.changed',
  'rating.changed',
  'shelf.removed',
  'book.released',
]);
