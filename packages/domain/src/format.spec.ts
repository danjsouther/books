import { describe, expect, it } from 'vitest';
import { formatReleaseDate } from './format';

describe('formatReleaseDate', () => {
  it('renders a day-precision date as "5 March 2027"', () => {
    expect(formatReleaseDate('2027-03-05', 'day')).toBe('5 March 2027');
  });

  it('renders a month-precision date as "March 2027"', () => {
    expect(formatReleaseDate('2027-03-01', 'month')).toBe('March 2027');
  });

  it('renders a year-precision date as "2027 (month TBA)"', () => {
    expect(formatReleaseDate('2027-01-01', 'year')).toBe('2027 (month TBA)');
  });

  it('renders unknown precision as "Release date unknown", regardless of date', () => {
    expect(formatReleaseDate(null, 'unknown')).toBe('Release date unknown');
  });

  it('never shifts the date by timezone parsing', () => {
    // A naive `new Date('2027-03-05')` parse plus a local-timezone formatter can
    // render 4 March in timezones west of UTC — this asserts the UTC-anchored
    // parse holds regardless of where the test runs.
    expect(formatReleaseDate('2027-01-01', 'day')).toBe('1 January 2027');
    expect(formatReleaseDate('2027-12-31', 'day')).toBe('31 December 2027');
  });
});
