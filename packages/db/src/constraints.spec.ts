import { slugify } from '@books/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { Db } from './client';
import { authorBooks } from './schema/author-books';
import { authors } from './schema/authors';
import { books } from './schema/books';
import { series } from './schema/series';
import { bookUserStatus } from './schema/shelf';
import {
  connectForTests,
  createTestUser,
  hasDatabase,
  truncateAll,
  violatedConstraint,
} from './test-support';

/** These specs assert on constraints unrelated to `slug` — this fills it in from
 *  `title`/`name` so each row stays valid without every call site repeating it. */
function bookRow(title: string, extra: Partial<typeof books.$inferInsert> = {}) {
  return { title, slug: slugify(title), ...extra };
}
function seriesRow(name: string, extra: Partial<typeof series.$inferInsert> = {}) {
  return { name, slug: slugify(name), ...extra };
}

describe.skipIf(!hasDatabase)('schema constraints', () => {
  let db: Db;
  let pool: Pool;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });

  describe('release precision and date must agree', () => {
    it('rejects day precision with no date', async () => {
      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Undated', { releasePrecision: 'day', releaseDate: null })),
      );
      expect(violation).toBe('books_release_precision_date_agree');
    });

    it('rejects unknown precision carrying a date', async () => {
      const violation = await violatedConstraint(() =>
        db
          .insert(books)
          .values(bookRow('Dated', { releasePrecision: 'unknown', releaseDate: '2027-03-05' })),
      );
      expect(violation).toBe('books_release_precision_date_agree');
    });

    it('accepts each precision paired with the earliest consistent date', async () => {
      await db
        .insert(books)
        .values([
          bookRow('Exact', { releasePrecision: 'day', releaseDate: '2027-03-05' }),
          bookRow('Month', { releasePrecision: 'month', releaseDate: '2027-03-01' }),
          bookRow('Year', { releasePrecision: 'year', releaseDate: '2027-01-01' }),
          bookRow('TBA', { releasePrecision: 'unknown', releaseDate: null }),
        ]);
      expect(await db.select().from(books)).toHaveLength(4);
    });
  });

  it('rejects a rating outside 0..10 but allows 0 and null', async () => {
    const userId = await createTestUser(db);
    const [row] = await db.insert(books).values(bookRow('Rated')).returning({ id: books.id });
    const bookId = row?.id ?? '';

    const violation = await violatedConstraint(() =>
      db.insert(bookUserStatus).values({ bookId, userId, status: 'completed', rating: 11 }),
    );
    expect(violation).toBe('book_user_status_rating_range');

    // 0 is a real score, distinct from "no opinion" — which is why the column is
    // nullable rather than using a sentinel.
    await db.insert(bookUserStatus).values({ bookId, userId, status: 'completed', rating: 0 });
    const stored = await db.select().from(bookUserStatus);
    expect(stored[0]?.rating).toBe(0);
  });

  it('rejects a finish date before the start date', async () => {
    const userId = await createTestUser(db);
    const [row] = await db.insert(books).values(bookRow('Backwards')).returning({ id: books.id });

    const violation = await violatedConstraint(() =>
      db.insert(bookUserStatus).values({
        bookId: row?.id ?? '',
        userId,
        startedAt: '2026-05-02',
        finishedAt: '2026-05-01',
      }),
    );
    expect(violation).toBe('book_user_status_dates_ordered');
  });

  describe('ASIN format', () => {
    it('rejects anything that is not ten characters', async () => {
      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Bad ASIN', { asin: '123' })),
      );
      expect(violation).toBe('books_asin_format');
    });

    it('rejects lowercase, since Amazon ASINs are upper case', async () => {
      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Lowercase', { asin: 'b00x57b4ke' })),
      );
      expect(violation).toBe('books_asin_format');
    });

    it('accepts an Amazon ASIN and an ISBN-10, including a check-digit X', async () => {
      await db
        .insert(books)
        .values([
          bookRow('Amazon', { asin: 'B00X57B4KE' }),
          bookRow('ISBN-10', { asin: '0316129089' }),
          bookRow('Check digit X', { asin: '080442957X' }),
        ]);
      expect(await db.select().from(books)).toHaveLength(3);
    });
  });

  describe('book URL scheme', () => {
    it('rejects a URL with no http(s) scheme', async () => {
      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Ftp', { url: 'ftp://example.com/book' })),
      );
      expect(violation).toBe('books_url_scheme');
    });

    it('accepts http and https', async () => {
      await db
        .insert(books)
        .values([
          bookRow('Http', { url: 'http://example.com/book' }),
          bookRow('Https', { url: 'https://example.com/book' }),
        ]);
      expect(await db.select().from(books)).toHaveLength(2);
    });
  });

  it('rejects a non-positive page count', async () => {
    const violation = await violatedConstraint(() =>
      db.insert(books).values(bookRow('Empty', { pageCount: 0 })),
    );
    expect(violation).toBe('books_page_count_positive');
  });

  describe('book ASINs are unique among live rows', () => {
    it('refuses a second live book with the same ASIN', async () => {
      await db.insert(books).values(bookRow('First', { asin: '0316129089' }));

      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Second', { asin: '0316129089' })),
      );
      expect(violation).toBe('books_live_asin_key');
    });

    it('ignores books with no ASIN, because NULLs are distinct', async () => {
      await db.insert(books).values([bookRow('No ASIN A'), bookRow('No ASIN B')]);
      expect(await db.select().from(books)).toHaveLength(2);
    });

    it('frees the ASIN once the book is trashed', async () => {
      const deletedAt = new Date();
      await db.insert(books).values(bookRow('Trashed', { asin: '0316129089', deletedAt }));
      await db.insert(books).values(bookRow('Replacement', { asin: '0316129089' }));
      expect(await db.select().from(books)).toHaveLength(2);
    });
  });

  describe('slugs', () => {
    it('is enforced globally, not just among live rows — unlike the ASIN index', async () => {
      const deletedAt = new Date();
      await db.insert(books).values(bookRow('Same Title', { deletedAt }));

      const violation = await violatedConstraint(() =>
        db.insert(books).values(bookRow('Same Title')),
      );
      expect(violation).toBe('books_slug_key');
    });

    it('rejects a duplicate series slug the same way', async () => {
      await db.insert(series).values(seriesRow('Same Name'));

      const violation = await violatedConstraint(() =>
        db.insert(series).values(seriesRow('Same Name')),
      );
      expect(violation).toBe('series_slug_key');
    });
  });

  describe('series names are deliberately not unique', () => {
    it('allows two live series with the same name', async () => {
      // A series name is a label on a grouping, not an identity. Contrast authors
      // below, where the name IS the identity. Slugs still have to differ, since
      // slug uniqueness is a separate, unrelated rule — see 'slugs' above.
      await db
        .insert(series)
        .values([seriesRow('Chronicles'), seriesRow('chronicles', { slug: 'chronicles-2' })]);
      expect(await db.select().from(series)).toHaveLength(2);
    });
  });

  describe('author names are unique, case-insensitively', () => {
    it('refuses a second author differing only in case', async () => {
      await db.insert(authors).values({ name: 'Martha Wells' });

      const violation = await violatedConstraint(() =>
        db.insert(authors).values({ name: 'martha wells' }),
      );
      expect(violation).toBe('authors_name_lower_key');
    });

    it('refuses the same author twice on one book', async () => {
      const [author] = await db
        .insert(authors)
        .values({ name: 'Solo' })
        .returning({ id: authors.id });
      const [bookRowResult] = await db
        .insert(books)
        .values(bookRow('Book'))
        .returning({ id: books.id });

      await db
        .insert(authorBooks)
        .values({ authorId: author?.id ?? '', bookId: bookRowResult?.id ?? '', position: 0 });

      const violation = await violatedConstraint(() =>
        db
          .insert(authorBooks)
          .values({ authorId: author?.id ?? '', bookId: bookRowResult?.id ?? '', position: 1 }),
      );
      expect(violation).toBe('author_books_pair_key');
    });
  });
});
