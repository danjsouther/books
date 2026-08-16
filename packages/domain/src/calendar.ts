const DAY_MS = 86_400_000;

/** One cell of a month calendar grid. */
export interface DayCell {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * A fixed 6×7 month grid (never fewer rows, so switching months never shifts
 * surrounding layout). All dates are `YYYY-MM-DD` strings. Arithmetic is done
 * entirely on UTC-constructed timestamps and re-serialized by hand — never
 * `new Date('2027-03-05')`, which parses as UTC midnight and reads back a day
 * off in any local-getter call west of Greenwich. `todayIso` is a parameter
 * rather than read from the clock here, so this function stays pure.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  todayIso: string,
  weekStartsOn = 1,
): DayCell[][] {
  const firstOfMonthMs = Date.UTC(year, month - 1, 1);
  const firstWeekday = new Date(firstOfMonthMs).getUTCDay();
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStartMs = firstOfMonthMs - leadingDays * DAY_MS;

  const weeks: DayCell[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: DayCell[] = [];
    for (let day = 0; day < 7; day++) {
      const cellMs = gridStartMs + (week * 7 + day) * DAY_MS;
      const cellDate = new Date(cellMs);
      const iso = toIso(cellMs);
      row.push({
        iso,
        day: cellDate.getUTCDate(),
        inMonth: cellDate.getUTCFullYear() === year && cellDate.getUTCMonth() === month - 1,
        isToday: iso === todayIso,
      });
    }
    weeks.push(row);
  }
  return weeks;
}
