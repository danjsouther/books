const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

/** `nowMs` is a parameter rather than read from the clock here, so this stays
 *  trivially testable with a fixed instant — the same discipline as
 *  `buildMonthGrid`'s `todayIso` parameter. Only the one call site per page
 *  reads `Date.now()`. */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const diffMs = new Date(iso).getTime() - nowMs;
  const absMs = Math.abs(diffMs);

  for (const { unit, ms } of UNITS) {
    if (absMs >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return formatter.format(Math.round(diffMs / 1000), 'second');
}
