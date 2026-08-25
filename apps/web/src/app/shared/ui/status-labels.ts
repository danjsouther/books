import type { BookStatus } from '@books/domain';

/** Single source of truth for a status's display text — every place that
 *  renders a `BookStatus` (the picker, chips, the status filter) reads from
 *  here instead of falling back to the raw enum value, which is not
 *  presentable on its own (`set_aside`, not "Set Aside"). */
export const BOOK_STATUS_LABELS: Readonly<Record<BookStatus, string>> = {
  plan: 'Plan',
  backlog: 'Backlog',
  reading: 'Reading',
  set_aside: 'Set Aside',
  completed: 'Completed',
  dropped: 'Dropped',
};
