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

  it('never collapses book.added, shelf.removed, or book.released, even when repeated', () => {
    const items: ActivityItem[] = [
      item('book.added', '2027-03-05T20:00:00Z', undefined, undefined),
      item('book.added', '2027-03-05T09:00:00Z', undefined, undefined),
      item('shelf.removed', '2027-03-05T18:00:00Z', undefined, undefined),
      item('shelf.removed', '2027-03-05T08:00:00Z', undefined, undefined),
      item('book.released', '2027-03-05T00:00:00Z', undefined, undefined, { actor: null }),
    ];

    const result = collapseActivity(items);

    expect(result).toHaveLength(5);
    expect(result.every((r) => r.count === 1)).toBe(true);
  });

  it('gives a non-repeated row a count of 1', () => {
    const result = collapseActivity([item('rating.changed', '2027-03-05T09:00:00Z', null, 8)]);

    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1);
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
