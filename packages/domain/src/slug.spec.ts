import { describe, expect, it } from 'vitest';
import { nextSlugCandidate, slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(slugify('Leviathan Wakes')).toBe('leviathan-wakes');
  });

  it('collapses punctuation and apostrophes to single hyphens', () => {
    expect(slugify("Caliban's War")).toBe('caliban-s-war');
  });

  it('transliterates accented characters to ASCII', () => {
    expect(slugify('Café Nervosa')).toBe('cafe-nervosa');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });

  it('falls back to a random slug when nothing ASCII-alphanumeric survives', () => {
    const slug = slugify('☕️🎉');
    expect(slug).toMatch(/^item-[a-z0-9]+$/);
  });

  it('truncates a long title at a word boundary rather than mid-word', () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${String(i)}`);
    const slug = slugify(words.join(' '));
    const fullSlug = words.join('-');

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    // Every word in the truncated slug is a complete, unbroken word from the
    // original — never a fragment like `word1` cut down to `wor`.
    expect(fullSlug.startsWith(slug)).toBe(true);
    expect(fullSlug[slug.length]).toBe('-');
  });
});

describe('nextSlugCandidate', () => {
  it('returns the bare base on the first attempt', () => {
    expect(nextSlugCandidate('dune', 1)).toBe('dune');
  });

  it('appends a numeric suffix on later attempts', () => {
    expect(nextSlugCandidate('dune', 2)).toBe('dune-2');
    expect(nextSlugCandidate('dune', 3)).toBe('dune-3');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when nothing collides', async () => {
    const slug = await uniqueSlug('dune', () => Promise.resolve(false));
    expect(slug).toBe('dune');
  });

  it('increments the suffix until it finds a free slug', async () => {
    const taken = new Set(['dune', 'dune-2', 'dune-3']);
    const slug = await uniqueSlug('dune', (candidate) => Promise.resolve(taken.has(candidate)));
    expect(slug).toBe('dune-4');
  });

  it('falls back to a random suffix past maxAttempts rather than looping forever', async () => {
    const slug = await uniqueSlug('dune', () => Promise.resolve(true), 3);
    expect(slug).toMatch(/^dune-[a-z0-9]+$/);
    expect(slug).not.toBe('dune-4');
  });
});
