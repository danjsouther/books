import type { ChangeItem } from '@books/domain';
import { collapseChanges } from './collapse-changes';

function edit(version: number, changedAt: string, overrides: Partial<ChangeItem> = {}): ChangeItem {
  return {
    entityType: 'book',
    entityId: 'b1',
    version,
    changeKind: 'edited',
    actorId: 'u1',
    changedAt,
    title: 'A Book',
    changedFields: [`field${String(version)}`],
    ...overrides,
  };
}

describe('collapseChanges', () => {
  it('collapses a burst of edits by the same actor within an hour into one row', () => {
    const items: ChangeItem[] = [
      edit(4, '2027-03-05T12:45:00Z'),
      edit(3, '2027-03-05T12:30:00Z'),
      edit(2, '2027-03-05T12:15:00Z'),
      edit(1, '2027-03-05T12:00:00Z'),
    ];
    const result = collapseChanges(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(4);
    expect(result[0]?.version).toBe(4);
    expect(result[0]?.oldestVersion).toBe(0);
    expect(result[0]?.changedFields).toEqual(['field4', 'field3', 'field2', 'field1']);
  });

  it('does not merge edits more than an hour apart', () => {
    const items: ChangeItem[] = [edit(2, '2027-03-05T14:00:00Z'), edit(1, '2027-03-05T12:00:00Z')];
    const result = collapseChanges(items);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.count)).toEqual([1, 1]);
  });

  it('does not merge edits by a different actor', () => {
    const items: ChangeItem[] = [
      edit(2, '2027-03-05T12:10:00Z', { actorId: 'u2' }),
      edit(1, '2027-03-05T12:00:00Z', { actorId: 'u1' }),
    ];
    const result = collapseChanges(items);
    expect(result).toHaveLength(2);
  });

  it('never merges created/deleted/restored/reverted rows, even adjacent ones', () => {
    const items: ChangeItem[] = [
      edit(2, '2027-03-05T12:05:00Z', { changeKind: 'reverted' }),
      edit(1, '2027-03-05T12:00:00Z', { changeKind: 'created' }),
    ];
    const result = collapseChanges(items);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.count)).toEqual([1, 1]);
  });

  it('does not merge across a different entity in between (consecutive only)', () => {
    const items: ChangeItem[] = [
      edit(3, '2027-03-05T12:20:00Z', { entityId: 'b1' }),
      edit(1, '2027-03-05T12:10:00Z', { entityId: 'b2' }),
      edit(2, '2027-03-05T12:00:00Z', { entityId: 'b1' }),
    ];
    const result = collapseChanges(items);
    expect(result).toHaveLength(3);
  });
});
