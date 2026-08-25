export interface ChangelogEntry {
  readonly category: string;
  readonly title: string;
  readonly date: string;
  readonly body: string;
}

export interface ChangelogSection {
  readonly date: string;
  readonly entries: ChangelogEntry[];
}

const VERSION_HEADING = /^## (.+) - (\d{4}-\d{2}-\d{2})$/;
const ENTRY_HEADING = /^### (.+) — (.+) \((\d{4}-\d{2}-\d{2})\)$/;

/**
 * Finds the `## {version} - {date}` section of a Keep a Changelog-formatted
 * `CHANGELOG.md` and returns its entries structured. Returns `null` if no
 * section for that version exists — e.g. a release commit that bumped the
 * version without moving the `## Unreleased` entries under a matching
 * heading — so the caller can fail loudly instead of posting nothing or
 * posting the wrong section.
 */
export function parseChangelogSection(markdown: string, version: string): ChangelogSection | null {
  const lines = markdown.split('\n');

  let start = -1;
  let date = '';
  for (let i = 0; i < lines.length; i++) {
    const match = VERSION_HEADING.exec(lines[i] ?? '');
    if (match?.[1] === version) {
      start = i + 1;
      date = match[2] ?? '';
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i]?.startsWith('## ')) {
      end = i;
      break;
    }
  }

  const entries: ChangelogEntry[] = [];
  let current: { category: string; title: string; date: string; body: string[] } | null = null;

  for (const line of lines.slice(start, end)) {
    const match = ENTRY_HEADING.exec(line);
    if (match) {
      if (current) entries.push({ ...current, body: current.body.join('\n').trim() });
      current = { category: match[1] ?? '', title: match[2] ?? '', date: match[3] ?? '', body: [] };
    } else {
      current?.body.push(line);
    }
  }
  if (current) entries.push({ ...current, body: current.body.join('\n').trim() });

  return { date, entries };
}
