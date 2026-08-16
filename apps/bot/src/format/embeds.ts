import type { APIEmbed, APIEmbedField } from 'discord.js';
import type { UpcomingRelease } from '@books/db';

const MAX_FIELDS = 25;
const MAX_FIELD_CHARS = 1024;
const MAX_TOTAL_CHARS = 6000;
const MAX_LINES_PER_FIELD = 10;
const EMBED_COLOR = 0x5865f2; // Discord "blurple" — no theming hook exists yet to draw this from.

function parseUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parseUtcDate(iso));
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function releaseLine(release: UpcomingRelease, webBaseUrl: string): string {
  const date = shortDate(release.releaseDate);
  const url = `${webBaseUrl}/books/${release.id}`;
  const series =
    release.seriesName !== null
      ? ` — ${release.seriesName}${release.seriesPosition !== null ? ` #${release.seriesPosition}` : ''}`
      : '';
  return `\`${date}\` **[${release.title}](${url})**${series}`;
}

function groupByMonth(releases: readonly UpcomingRelease[]): Map<string, UpcomingRelease[]> {
  const groups = new Map<string, UpcomingRelease[]>();
  for (const release of releases) {
    const key = release.releaseDate.slice(0, 7);
    const group = groups.get(key);
    if (group) group.push(release);
    else groups.set(key, [release]);
  }
  return groups;
}

/**
 * Pure DTO → embed-JSON, no `Client`/gateway import — unit-testable without a
 * connection. Defensively enforces Discord's hard caps: exceeding any of them
 * rejects the whole message, not just the offending field, and a busy
 * multi-month window hits these sooner than it looks like it should.
 */
export function buildUpcomingEmbed(
  releases: readonly UpcomingRelease[],
  webBaseUrl: string,
): APIEmbed {
  const title = '📚 Upcoming releases';
  const groups = [...groupByMonth(releases).entries()].sort(([a], [b]) => a.localeCompare(b));

  const fields: APIEmbedField[] = [];
  let totalChars = title.length;

  for (const [monthKey, monthReleases] of groups) {
    if (fields.length >= MAX_FIELDS) break;

    const name = monthLabel(monthKey);
    const shown = monthReleases.slice(0, MAX_LINES_PER_FIELD);
    const remaining = monthReleases.length - shown.length;
    const lines = shown.map((r) => releaseLine(r, webBaseUrl));
    if (remaining > 0) {
      lines.push(`…and ${String(remaining)} more — [see the calendar](${webBaseUrl}/calendar)`);
    }

    let value = lines.join('\n');
    if (value.length > MAX_FIELD_CHARS) value = `${value.slice(0, MAX_FIELD_CHARS - 1)}…`;

    if (totalChars + name.length + value.length > MAX_TOTAL_CHARS) break;

    fields.push({ name, value });
    totalChars += name.length + value.length;
  }

  const count = releases.length;
  return {
    title,
    color: EMBED_COLOR,
    fields,
    footer: { text: `${String(count)} release${count === 1 ? '' : 's'}` },
  };
}
