import type { ReleasePrecision } from './book';

/** `date` is always the earliest date consistent with `precision` (see
 *  `schema/books.ts`) — parsed as UTC so a member in any timezone reads the same
 *  calendar date the release actually is, never shifted a day by local parsing. */
function parseUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/**
 * Renders a release date at exactly the precision the catalog actually knows —
 * never more, never less. Isomorphic (no Node/Angular import) so the Discord bot
 * can format a release announcement with the identical text the web app shows.
 */
export function formatReleaseDate(date: string | null, precision: ReleasePrecision): string {
  switch (precision) {
    case 'day': {
      if (date === null) return 'Release date unknown';
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parseUtcDate(date));
    }
    case 'month': {
      if (date === null) return 'Release date unknown';
      return new Intl.DateTimeFormat('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parseUtcDate(date));
    }
    case 'year': {
      if (date === null) return 'Release date unknown';
      const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' }).format(
        parseUtcDate(date),
      );
      return `${year} (month TBA)`;
    }
    case 'unknown':
      return 'Release date unknown';
  }
}
