import { describe, expect, it } from 'vitest';
import { parseChangelogSection } from './changelog';

const CHANGELOG = `# Changelog

## Unreleased

### Added — Shelf entries can be marked "Set Aside" (2026-08-24)

There's now a status for a book you started and paused partway through.

## 0.6.1 - 2026-08-25

### Fixed — Books list status filter matched any member's shelf, not yours (2026-08-25)

Filtering the books list by status matched a book if _any_ member had it at
that status, not just the one applying the filter.

## 0.6.0 - 2026-08-24

### Added — Shelf entries have a progress slider and two notes (2026-08-24)

Your shelf entry for a book now tracks how far into it you are.

### Fixed — Book and series descriptions keep their line breaks (2026-08-24)

Descriptions were rendered as plain \`<p>\` text.
`;

describe('parseChangelogSection', () => {
  it('extracts the date and single entry for a patch release', () => {
    const section = parseChangelogSection(CHANGELOG, '0.6.1');
    expect(section?.date).toBe('2026-08-25');
    expect(section?.entries).toHaveLength(1);
    expect(section?.entries[0]).toMatchObject({
      category: 'Fixed',
      title: "Books list status filter matched any member's shelf, not yours",
      date: '2026-08-25',
    });
    expect(section?.entries[0]?.body).toContain('any_ member');
  });

  it('extracts every entry for a release with multiple changes, stopping at the next version heading', () => {
    const section = parseChangelogSection(CHANGELOG, '0.6.0');
    expect(section?.entries.map((e) => e.category)).toEqual(['Added', 'Fixed']);
    expect(section?.entries[1]?.body).toContain('rendered as plain');
  });

  it('returns null for a version with no matching heading', () => {
    expect(parseChangelogSection(CHANGELOG, '9.9.9')).toBeNull();
  });

  it('does not match the Unreleased heading', () => {
    expect(parseChangelogSection(CHANGELOG, 'Unreleased')).toBeNull();
  });
});
