import type { ActivityItem, ActivityKind } from '@books/domain';
import { collapseActivity } from './collapse-activity';

function item(
  kind: ActivityKind,
  createdAt: string,
  from: unknown,
  to: unknown,
  overrides: Partial<ActivityItem> = {},
): ActivityItem {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    kind,
    actor: { id: 'u1', username: 'dan' },
    book: { id: 'b1', title: 'A Book' },
    payload: { from, to },
    createdAt,
    ...overrides,
  };
}

describe('collapseActivity', () => {
  it('collapses same-day, same-kind, same-actor, same-book rows even with something else interleaved', () => {
    const items: ActivityItem[] = [
      item('rating.changed', '2027-03-05T20:00:00Z', 7, 9),
      item('book.added', '2027-03-05T15:00:00Z', undefined, undefined, {
        actor: { id: 'u2', username: 'sam' },
        book: { id: 'b2', title: 'Other Book' },
      }),
      item('rating.changed', '2027-03-05T09:00:00Z', 5, 7),
    ];

    const result = collapseActivity(items);

    const ratingRows = result.filter((r) => r.kind === 'rating.changed');
    expect(ratingRows).toHaveLength(1);
    expect(ratingRows[0]?.count).toBe(2);
    expect(ratingRows[0]?.payload).toEqual({ from: 5, to: 9 });
    expect(ratingRows[0]?.createdAt).toBe('2027-03-05T20:00:00Z');
  });

  it('keeps rows on different UTC days separate', () => {
    const items: ActivityItem[] = [
      item('status.changed', '2027-03-06T01:00:00Z', 'reading', 'completed'),
      item('status.changed', '2027-03-05T23:00:00Z', 'backlog', 'reading'),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.count)).toEqual([1, 1]);
  });

  it('groups status.changed and rating.changed independently, never merging with each other', () => {
    const items: ActivityItem[] = [
      item('status.changed', '2027-03-05T20:00:00Z', 'reading', 'completed'),
      item('rating.changed', '2027-03-05T09:00:00Z', 5, 7),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.count)).toEqual([1, 1]);
  });

  it('never collapses book.added or book.released, even when repeated', () => {
    const items: ActivityItem[] = [
      item('book.added', '2027-03-05T20:00:00Z', undefined, undefined),
      item('book.added', '2027-03-05T09:00:00Z', undefined, undefined),
      item('book.released', '2027-03-05T00:00:00Z', undefined, undefined, { actor: null }),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.count === 1)).toBe(true);
  });

  it('gives a non-repeated row a count of 1', () => {
    const result = collapseActivity([item('rating.changed', '2027-03-05T09:00:00Z', null, 8)]);

    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1);
  });

  it('collapses an alternating status.changed/shelf.removed burst for the same actor/book/day into one row', () => {
    // The status picker's deselect-to-remove toggle lets a member click
    // through backlog -> removed -> reading -> removed -> completed ->
    // removed in one sitting; each click is a real, separately-logged
    // request, but it should still read as one line, not six.
    const items: ActivityItem[] = [
      item('shelf.removed', '2027-03-05T23:59:58Z', undefined, undefined),
      item('status.changed', '2027-03-05T23:59:57Z', null, 'completed'),
      item('shelf.removed', '2027-03-05T18:03:00Z', undefined, undefined),
      item('status.changed', '2027-03-05T18:02:00Z', null, 'reading'),
      item('shelf.removed', '2027-03-05T18:01:00Z', undefined, undefined),
      item('status.changed', '2027-03-05T18:00:00Z', null, 'backlog'),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('shelf.removed');
    expect(result[0]?.count).toBe(6);
    expect(result[0]?.createdAt).toBe('2027-03-05T23:59:58Z');
  });

  it('chains payload.from across a same-kind run but not across an interleaved different kind', () => {
    const items: ActivityItem[] = [
      item('status.changed', '2027-03-05T20:00:00Z', 'reading', 'completed'),
      item('status.changed', '2027-03-05T19:00:00Z', 'backlog', 'reading'),
      item('shelf.removed', '2027-03-05T18:00:00Z', undefined, undefined),
      item('status.changed', '2027-03-05T10:00:00Z', null, 'plan'),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('status.changed');
    expect(result[0]?.count).toBe(4);
    // Chains back through the two adjacent status.changed rows (completed's
    // "from" becomes reading's "from" becomes backlog) but stops at the
    // shelf.removed rather than reaching back to the oldest "plan" row.
    expect(result[0]?.payload).toEqual({ from: 'backlog', to: 'completed' });
  });

  it('does not merge shelf-state rows for a different actor or book', () => {
    const items: ActivityItem[] = [
      item('status.changed', '2027-03-05T22:00:00Z', 'reading', 'completed'),
      item('shelf.removed', '2027-03-05T18:00:00Z', undefined, undefined, {
        actor: { id: 'u2', username: 'sam' },
      }),
      item('status.changed', '2027-03-05T10:00:00Z', 'backlog', 'reading'),
    ];

    const result = collapseActivity(items);

    const statusRows = result.filter((r) => r.kind === 'status.changed');
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0]?.count).toBe(2);
    expect(statusRows[0]?.payload).toEqual({ from: 'backlog', to: 'completed' });
  });

  it('keeps shelf-state and rating.changed in separate groups', () => {
    const items: ActivityItem[] = [
      item('shelf.removed', '2027-03-05T20:00:00Z', undefined, undefined),
      item('rating.changed', '2027-03-05T19:00:00Z', 5, 8),
      item('status.changed', '2027-03-05T09:00:00Z', 'backlog', 'reading'),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.kind === 'rating.changed')?.count).toBe(1);
    expect(result.find((r) => r.kind === 'shelf.removed')?.count).toBe(2);
  });

  it('does not group different actors or different books together', () => {
    const items: ActivityItem[] = [
      item('rating.changed', '2027-03-05T20:00:00Z', 5, 9, {
        actor: { id: 'u2', username: 'sam' },
      }),
      item('rating.changed', '2027-03-05T09:00:00Z', 5, 7),
      item('rating.changed', '2027-03-05T08:00:00Z', 3, 6, {
        book: { id: 'b2', title: 'Other Book' },
      }),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.count === 1)).toBe(true);
  });
});
