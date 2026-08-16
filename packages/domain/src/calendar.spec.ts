import { describe, expect, it } from 'vitest';
import { buildMonthGrid } from './calendar';

describe('buildMonthGrid', () => {
  it('always returns 6 rows of 7 days', () => {
    const grid = buildMonthGrid(2027, 3, '2027-03-05');
    expect(grid).toHaveLength(6);
    for (const row of grid) expect(row).toHaveLength(7);
  });

  it('has no leading out-of-month days when the month starts on weekStartsOn', () => {
    // 2027-03-01 is a Monday; weekStartsOn defaults to Monday (1).
    const grid = buildMonthGrid(2027, 3, '2027-03-05');
    expect(grid[0]?.[0]?.iso).toBe('2027-03-01');
    expect(grid[0]?.[0]?.inMonth).toBe(true);
  });

  it('pads leading and trailing days for a month starting mid-week', () => {
    // 2027-02-01 is a Monday, so March (starting Monday) has no lead-in — use
    // April 2027, which starts on a Thursday.
    const grid = buildMonthGrid(2027, 4, '2027-04-10');
    const firstRow = grid[0]!;
    expect(firstRow[0]?.inMonth).toBe(false);
    expect(firstRow[3]?.iso).toBe('2027-04-01');
    expect(firstRow[3]?.inMonth).toBe(true);

    const flat = grid.flat();
    const last = flat[flat.length - 1]!;
    // April has 30 days; the grid should extend into May and never regress
    // back into March.
    const inMonthDates = flat.filter((c) => c.inMonth).map((c) => c.iso);
    expect(inMonthDates[0]).toBe('2027-04-01');
    expect(inMonthDates[inMonthDates.length - 1]).toBe('2027-04-30');
    expect(last.iso >= '2027-04-30').toBe(true);
  });

  it('marks exactly one cell as today when todayIso falls inside the month', () => {
    const grid = buildMonthGrid(2027, 3, '2027-03-17');
    const todays = grid.flat().filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.iso).toBe('2027-03-17');
  });

  it('marks no cell as today when todayIso falls outside the month', () => {
    const grid = buildMonthGrid(2027, 3, '2027-06-01');
    expect(grid.flat().some((c) => c.isToday)).toBe(false);
  });

  it('handles a leap-year February correctly', () => {
    const grid = buildMonthGrid(2028, 2, '2028-02-01');
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[inMonth.length - 1]?.iso).toBe('2028-02-29');
  });

  it('handles a non-leap-year February correctly', () => {
    const grid = buildMonthGrid(2027, 2, '2027-02-01');
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(inMonth[inMonth.length - 1]?.iso).toBe('2027-02-28');
  });

  it('respects a custom weekStartsOn', () => {
    // Sunday-start (0): 2027-03-01 is a Monday, so the grid should lead with Sunday Feb 28.
    const grid = buildMonthGrid(2027, 3, '2027-03-05', 0);
    expect(grid[0]?.[0]?.iso).toBe('2027-02-28');
    expect(grid[0]?.[1]?.iso).toBe('2027-03-01');
  });
});
