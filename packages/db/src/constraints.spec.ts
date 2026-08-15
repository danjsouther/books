import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { Db } from './client';
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
        db.insert(books).values({ title: 'Undated', releasePrecision: 'day', releaseDate: null }),
      );
      expect(violation).toBe('books_release_precision_date_agree');
    });

    it('rejects unknown precision carrying a date', async () => {
      const violation = await violatedConstraint(() =>
        db
          .insert(books)
          .values({ title: 'Dated', releasePrecision: 'unknown', releaseDate: '2027-03-05' }),
      );
      expect(violation).toBe('books_release_precision_date_agree');
    });

    it('accepts each precision paired with the earliest consistent date', async () => {
      await db.insert(books).values([
        { title: 'Exact', releasePrecision: 'day', releaseDate: '2027-03-05' },
        { title: 'Month', releasePrecision: 'month', releaseDate: '2027-03-01' },
        { title: 'Year', releasePrecision: 'year', releaseDate: '2027-01-01' },
        { title: 'TBA', releasePrecision: 'unknown', releaseDate: null },
      ]);
      expect(await db.select().from(books)).toHaveLength(4);
    });
  });

  it('rejects a rating outside 0..10 but allows 0 and null', async () => {
    const userId = await createTestUser(db);
    const [row] = await db.insert(books).values({ title: 'Rated' }).returning({ id: books.id });
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
    const [row] = await db.insert(books).values({ title: 'Backwards' }).returning({ id: books.id });

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

  it('rejects a malformed ISBN', async () => {
    const violation = await violatedConstraint(() =>
      db.insert(books).values({ title: 'Bad ISBN', isbn13: '123' }),
    );
    expect(violation).toBe('books_isbn13_format');
  });

  it('rejects a non-positive page count', async () => {
    const violation = await violatedConstraint(() =>
      db.insert(books).values({ title: 'Empty', pageCount: 0 }),
    );
    expect(violation).toBe('books_page_count_positive');
  });

  describe('uniqueness is scoped to live rows', () => {
    it('refuses two live series with the same name, whatever their versions', async () => {
      // The version-keyed scheme this replaced could not express that: two live
      // records sitting at different versions passed it happily.
      await db.insert(series).values({ name: 'The Expanse', version: 1 });

      const violation = await violatedConstraint(() =>
        db.insert(series).values({ name: 'the expanse', version: 4 }),
      );
      expect(violation).toBe('series_live_name_key');
    });

    it('allows any number of trashed series to share a name with a live one', async () => {
      const deletedAt = new Date();
      await db.insert(series).values([
        { name: 'Recycled', version: 2, deletedAt },
        { name: 'Recycled', version: 2, deletedAt },
        { name: 'Recycled', version: 7, deletedAt },
        { name: 'Recycled', version: 1 },
      ]);
      expect(await db.select().from(series)).toHaveLength(4);
    });

    it('applies the same rule to book ISBNs, and ignores books without one', async () => {
      await db.insert(books).values({ title: 'First', isbn13: '9780316129084' });

      const violation = await violatedConstraint(() =>
        db.insert(books).values({ title: 'Second', isbn13: '9780316129084' }),
      );
      expect(violation).toBe('books_live_isbn13_key');

      // NULLs are distinct in Postgres, so books with no ISBN never collide.
      await db.insert(books).values([{ title: 'No ISBN A' }, { title: 'No ISBN B' }]);
      expect(await db.select().from(books)).toHaveLength(3);
    });
  });
});
