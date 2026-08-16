import type { UpcomingRelease } from '@books/db';
import { describe, expect, it } from 'vitest';
import { buildUpcomingEmbed } from './embeds';

const WEB_BASE_URL = 'https://books.example.com';

function release(overrides: Partial<UpcomingRelease> = {}): UpcomingRelease {
  return {
    id: 'b1',
    title: 'A Book',
    releaseDate: '2027-03-05',
    releasePrecision: 'day',
    seriesId: null,
    seriesName: null,
    seriesPosition: null,
    ...overrides,
  };
}

describe('buildUpcomingEmbed', () => {
  it('titles the embed and groups releases into one field per month, in order', () => {
    const embed = buildUpcomingEmbed(
      [
        release({ id: 'b1', title: 'March Book', releaseDate: '2027-03-05' }),
        release({ id: 'b2', title: 'April Book', releaseDate: '2027-04-01' }),
      ],
      WEB_BASE_URL,
    );
    expect(embed.title).toBe('📚 Upcoming releases');
    expect(embed.fields?.map((f) => f.name)).toEqual(['March 2027', 'April 2027']);
    expect(embed.fields?.[0]?.value).toContain('March Book');
    expect(embed.fields?.[0]?.value).toContain(`${WEB_BASE_URL}/books/b1`);
  });

  it('includes series name and position when present', () => {
    const embed = buildUpcomingEmbed(
      [release({ seriesName: 'The Expanse', seriesPosition: '2' })],
      WEB_BASE_URL,
    );
    expect(embed.fields?.[0]?.value).toContain('The Expanse #2');
  });

  it('caps a month at 10 lines and adds a "…and N more" link to the calendar', () => {
    const releases = Array.from({ length: 12 }, (_, i) =>
      release({ id: `b${String(i)}`, title: `Book ${String(i)}`, releaseDate: '2027-03-01' }),
    );
    const embed = buildUpcomingEmbed(releases, WEB_BASE_URL);
    const value = embed.fields?.[0]?.value ?? '';
    const lines = value.split('\n');
    expect(lines).toHaveLength(11); // 10 releases + the "…and 2 more" line
    expect(lines[10]).toContain('…and 2 more');
    expect(lines[10]).toContain(`${WEB_BASE_URL}/calendar`);
  });

  it('stops adding fields at 25 months', () => {
    // 30 distinct months spread across ~2.5 years.
    const monthlyReleases = Array.from({ length: 30 }, (_, i) => {
      const month = (i % 12) + 1;
      const year = 2027 + Math.floor(i / 12);
      return release({
        id: `b${String(i)}`,
        releaseDate: `${String(year)}-${String(month).padStart(2, '0')}-01`,
      });
    });
    const embed = buildUpcomingEmbed(monthlyReleases, WEB_BASE_URL);
    expect(embed.fields?.length).toBeLessThanOrEqual(25);
  });

  it('keeps the total embed size at or under 6000 characters', () => {
    const monthlyReleases = Array.from({ length: 25 }, (_, i) => {
      const month = (i % 12) + 1;
      const year = 2027 + Math.floor(i / 12);
      return release({
        id: `b${String(i)}`,
        title: 'A'.repeat(200),
        releaseDate: `${String(year)}-${String(month).padStart(2, '0')}-01`,
      });
    });
    const embed = buildUpcomingEmbed(monthlyReleases, WEB_BASE_URL);
    const total =
      (embed.title?.length ?? 0) +
      (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
  });

  it('reports the full release count in the footer regardless of truncation', () => {
    const releases = Array.from({ length: 15 }, (_, i) =>
      release({ id: `b${String(i)}`, title: `Book ${String(i)}`, releaseDate: '2027-03-01' }),
    );
    const embed = buildUpcomingEmbed(releases, WEB_BASE_URL);
    expect(embed.footer?.text).toBe('15 releases');
  });

  it('uses singular "release" for exactly one', () => {
    const embed = buildUpcomingEmbed([release()], WEB_BASE_URL);
    expect(embed.footer?.text).toBe('1 release');
  });

  it('renders an empty embed with a zero-count footer for no releases', () => {
    const embed = buildUpcomingEmbed([], WEB_BASE_URL);
    expect(embed.fields).toEqual([]);
    expect(embed.footer?.text).toBe('0 releases');
  });
});
