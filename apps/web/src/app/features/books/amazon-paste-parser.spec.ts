import { looksLikeAmazonProductPaste, parseAmazonPaste } from './amazon-paste-parser';

/** A real "select all and copy" of an Amazon book listing's page text — no
 *  HTML markup survives into what a member actually pastes, and neither ASIN
 *  nor a cover image URL appears anywhere in the selectable page text. */
const REAL_LISTING_PASTE = `Hell Difficulty Tutorial: A LitRPG Adventure
by Cerim (Author) Format: Kindle Edition
4.5 4.5 out of 5 stars (7,156)
4.1 on Goodreads
5,559 ratings
Book 1 of 9: Hell Difficulty Tutorial
See all languages and editions
Where others see doom, he sees opportunity. Hell Difficulty? More like a chance to thrive.


Nathaniel's bus ride was supposed to be just another boring commute. Wrong. Now, he, 23 fellow
passengers, and a corgi named Biscuit, are stuck in a "Hell Difficulty" Tutorial, battling
monsters and leveling up to survive.

Easy difficulty, anyone can handle. Normal difficulty, you've got to put up a fight to get by.
Hard difficulty is where only the tough ones last. And Hell? That's where you have to be a bit
out of your mind!

With more than 10 million views as a web serial, this definitive version is perfect for fans of
The Primal Hunter, Defiance of the Fall, and Apocalypse: Generic System. Grab your copy today!
Read more

    Book 1 of 9
    Hell Difficulty Tutorial
    Print length
    618 pages
    Language
    English
    Accessibility
    Learn more
    Publication date
    May 14, 2024

Next slide of product details
See all details`;

const METADATA_ONLY_PREFIX = REAL_LISTING_PASTE.split('\n').slice(0, 6).join('\n');

/** A second real paste — a multi-author listing, where each author gets its
 *  own `(Author)` tag rather than one shared `(Authors)` covering the comma
 *  list — used to catch a bug the first fixture (single author) couldn't. */
const MULTI_AUTHOR_PASTE = `Are You Even Human: Volume 1
by Natalie Maher (Author), Thundamoo (Author) Format: Kindle Edition
4.8 4.8 out of 5 stars (276)
4.6 on Goodreads
288 ratings
Book 1 of 2: Are You Even Human
See all formats and editions
In 2025, the moon hatched and its child died. Things have since gotten worse.

Some people have super powers now, but so do the extradimensional invaders slowly wiping humanity out.

    Book 1 of 2
    Are You Even Human
    Print length
    604 pages
    Language
    English
    Accessibility
    Learn more
    Publication date
    August 23, 2024`;

describe('looksLikeAmazonProductPaste', () => {
  it('matches a full real listing paste', () => {
    expect(looksLikeAmazonProductPaste('', REAL_LISTING_PASTE)).toBe(true);
  });

  it('matches on metadata alone, without needing the description', () => {
    expect(looksLikeAmazonProductPaste('', METADATA_ONLY_PREFIX)).toBe(true);
  });

  it('rejects a bare title paste into a single field', () => {
    expect(looksLikeAmazonProductPaste('', 'Leviathan Wakes')).toBe(false);
  });

  it('rejects unrelated long prose with no Amazon markers', () => {
    const prose = 'This is just a long paragraph about something else entirely. '.repeat(10);
    expect(looksLikeAmazonProductPaste('', prose)).toBe(false);
  });
});

describe('parseAmazonPaste', () => {
  it('extracts title, subtitle, authors, page count, release date, and description from a real listing paste', () => {
    const result = parseAmazonPaste('', REAL_LISTING_PASTE);

    expect(result.fields.title).toBe('Hell Difficulty Tutorial');
    expect(result.fields.subtitle).toBe('A LitRPG Adventure');
    expect(result.fields.authors).toEqual(['Cerim']);
    expect(result.fields.pageCount).toBe(618);
    expect(result.fields.releaseDate).toBe('2024-05-14');
    expect(result.fields.releasePrecision).toBe('day');
    expect(result.fields.description).toContain('Where others see doom, he sees opportunity.');
    expect(result.fields.description).not.toContain('Read more');
  });

  it('leaves asin and coverUrl unmatched for a plain-text-only paste', () => {
    const result = parseAmazonPaste('', REAL_LISTING_PASTE);

    expect(result.fields.asin).toBeUndefined();
    expect(result.fields.coverUrl).toBeUndefined();
    expect(result.matchedFieldCount).toBe(8);
  });

  it('leaves release date unmatched when there is no "Publication date" label', () => {
    const withoutPublicationDate = REAL_LISTING_PASTE.replace(
      /\s*Publication date\n\s*May 14, 2024\n/,
      '\n',
    );
    const result = parseAmazonPaste('', withoutPublicationDate);

    expect(result.fields.releaseDate).toBeUndefined();
    expect(result.fields.releasePrecision).toBeUndefined();
  });

  it('leaves release date unmatched when the value after the label is not a parseable date', () => {
    const text = `Some Book\nby Someone (Author) Format: Kindle Edition\n4.5 out of 5 stars\nBook 1 of 2: Some Series\nPublication date\nSpring 2024\n`;
    const result = parseAmazonPaste('', text);

    expect(result.fields.releaseDate).toBeUndefined();
    expect(result.fields.releasePrecision).toBeUndefined();
  });

  it('leaves title whole, with no subtitle, when the title line has no colon', () => {
    const text = `Leviathan Wakes\nby James S. A. Corey (Author) Format: Kindle Edition\n4.5 out of 5 stars\nBook 1 of 9: The Expanse\n`;
    const result = parseAmazonPaste('', text);

    expect(result.fields.title).toBe('Leviathan Wakes');
    expect(result.fields.subtitle).toBeUndefined();
  });

  it('leaves title whole when the colon has nothing after it', () => {
    const text = `A Title With A Trailing Colon:\nby Someone (Author) Format: Kindle Edition\n4.5 out of 5 stars\nBook 1 of 2: Some Series\n`;
    const result = parseAmazonPaste('', text);

    expect(result.fields.title).toBe('A Title With A Trailing Colon:');
    expect(result.fields.subtitle).toBeUndefined();
  });

  it('parses a multi-author byline, where each author has its own "(Author)" tag', () => {
    const result = parseAmazonPaste('', MULTI_AUTHOR_PASTE);

    expect(result.fields.title).toBe('Are You Even Human');
    expect(result.fields.subtitle).toBe('Volume 1');
    expect(result.fields.authors).toEqual(['Natalie Maher', 'Thundamoo']);
    expect(result.fields.pageCount).toBe(604);
    expect(result.fields.seriesPosition).toBe('1');
    expect(result.fields.releaseDate).toBe('2024-08-23');
    expect(result.fields.releasePrecision).toBe('day');
    expect(result.fields.description).toBe(
      'In 2025, the moon hatched and its child died. Things have since gotten worse.\n\n' +
        'Some people have super powers now, but so do the extradimensional invaders slowly wiping humanity out.',
    );
  });

  it('parses the series position independently of series matching, which stays out of scope', () => {
    const result = parseAmazonPaste('', REAL_LISTING_PASTE);
    expect(result.fields.seriesPosition).toBe('1');
  });

  it('falls back to the product-details boundary when "Read more" is missing', () => {
    const withoutReadMore = REAL_LISTING_PASTE.replace(/\nRead more\n/, '\n');
    const result = parseAmazonPaste('', withoutReadMore);

    expect(result.fields.description).toBeDefined();
    expect(result.fields.description).not.toContain('Print length');
  });

  it('does not throw on empty input and returns no matched fields', () => {
    const result = parseAmazonPaste('', '');
    expect(result.fields).toEqual({});
    expect(result.matchedFieldCount).toBe(0);
  });

  it('truncates pathologically large input instead of hanging', () => {
    const huge = 'by Someone (Author) Format: Kindle Edition\n' + 'x'.repeat(300_000);
    expect(() => parseAmazonPaste('', huge)).not.toThrow();
  });
});
