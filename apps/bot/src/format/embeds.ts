import type { APIEmbed, APIEmbedField } from 'discord.js';
import type { UpcomingRelease } from '@books/db';
import type { ChangelogSection } from './changelog';

const MAX_FIELDS = 25;
const MAX_FIELD_NAME_CHARS = 256;
const MAX_FIELD_CHARS = 1024;
const MAX_TOTAL_CHARS = 6000;
const MAX_LINES_PER_FIELD = 10;
const EMBED_COLOR = 0x5865f2; // Discord "blurple" — no theming hook exists yet to draw this from.

const CATEGORY_ICONS: Readonly<Record<string, string>> = {
  Added: '✨',
  Changed: '♻️',
  Fixed: '🐛',
  Removed: '🗑️',
  Security: '🔒',
};

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

/**
 * Pure DTO → embed-JSON, same shape and same defensive char-budget as
 * `buildUpcomingEmbed` above: one field per changelog entry, capped at
 * Discord's real per-field and total-embed limits so a busy release can
 * never produce a message Discord rejects outright.
 */
export function buildChangelogEmbed(
  version: string,
  section: ChangelogSection,
  changelogUrl: string,
): APIEmbed {
  const title = `📦 v${version} released`;
  const fields: APIEmbedField[] = [];
  let totalChars = title.length;

  for (const entry of section.entries) {
    if (fields.length >= MAX_FIELDS) break;

    const icon = CATEGORY_ICONS[entry.category] ?? '•';
    let name = `${icon} ${entry.category} — ${entry.title}`;
    if (name.length > MAX_FIELD_NAME_CHARS) name = `${name.slice(0, MAX_FIELD_NAME_CHARS - 1)}…`;

    let value = entry.body;
    if (value.length > MAX_FIELD_CHARS) value = `${value.slice(0, MAX_FIELD_CHARS - 1)}…`;

    if (totalChars + name.length + value.length > MAX_TOTAL_CHARS) break;

    fields.push({ name, value });
    totalChars += name.length + value.length;
  }

  const count = section.entries.length;
  return {
    title,
    url: changelogUrl,
    color: EMBED_COLOR,
    fields,
    footer: { text: `${String(count)} change${count === 1 ? '' : 's'} — ${section.date}` },
  };
}
