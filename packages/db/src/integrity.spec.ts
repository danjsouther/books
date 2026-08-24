import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './client';
import { createBook, deleteBook, restoreBook, revertBook, updateBook } from './mutations/books';
import { createSeries, deleteSeries, restoreSeries } from './mutations/series';
import { seed } from './seed';
import { connectForTests, createTestUser, hasDatabase } from './test-support';
import type { Actor } from './mutations/with-revision';

/**
 * Invariants asserted as a *scan* rather than against one record. A single-record
 * test proves the happy path; a scan is what catches a mutation path that forgot to
 * append a revision, or a join row left pointing at nothing.
 */
describe.skipIf(!hasDatabase)('catalog integrity', () => {
  let db: Db;
  let pool: Pool;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });

  /** The seed, then a mixed workload touching every mutation path. */
  beforeEach(async () => {
    await seed(db);
    const actor: Actor = { id: await createTestUser(db, 'churn') };

    const series = await createSeries(
      db,
      { name: 'Churn', sortName: null, description: null, deletedAt: null, deletedBy: null },
      actor,
    );
    const book = await createBook(
      db,
      {
        title: 'Churned',
        subtitle: null,
        description: null,
        authors: ['Churn Author', 'Second Churn'],
        seriesId: series.id,
        seriesPosition: '1.00',
        releaseDate: '2026-01-01',
        releasePrecision: 'day',
        pageCount: 100,
        asin: 'B00CHURN01',
        coverUrl: null,
        url: null,
        deletedAt: null,
        deletedBy: null,
      },
      actor,
    );

    await updateBook(db, book.id, { pageCount: 200 }, actor);
    await updateBook(db, book.id, { authors: ['Second Churn'] }, actor);
    await deleteBook(db, book.id, actor);
    await restoreBook(db, book.id, actor);
    await revertBook(db, book.id, 2, actor);
    await deleteSeries(db, series.id, actor);
    await restoreSeries(db, series.id, actor);
  });

  it('leaves no author link pointing at a missing author or book', async () => {
    const orphans = await db.execute(sql`
      SELECT ab.id FROM author_books ab
        LEFT JOIN authors a ON a.id = ab.author_id
        LEFT JOIN books  b ON b.id = ab.book_id
       WHERE a.id IS NULL OR b.id IS NULL
    `);
    expect(orphans.rows).toEqual([]);
  });

  it('holds one author row per name, case-insensitively', async () => {
    const dupes = await db.execute(sql`
      SELECT lower(name) AS key FROM authors GROUP BY lower(name) HAVING count(*) > 1
    `);
    expect(dupes.rows).toEqual([]);
  });

  it('never credits the same author twice on one book', async () => {
    const dupes = await db.execute(sql`
      SELECT book_id, author_id FROM author_books
       GROUP BY book_id, author_id HAVING count(*) > 1
    `);
    expect(dupes.rows).toEqual([]);
  });

  it('gives every live book a unique ASIN', async () => {
    const dupes = await db.execute(sql`
      SELECT asin FROM books
       WHERE deleted_at IS NULL AND asin IS NOT NULL
       GROUP BY asin HAVING count(*) > 1
    `);
    expect(dupes.rows).toEqual([]);
  });

  it('gives every book and series a globally unique, non-empty slug', async () => {
    const dupes = await db.execute(sql`
      SELECT slug FROM books WHERE slug IS NULL OR slug = '' GROUP BY slug
      UNION ALL
      SELECT slug FROM books GROUP BY slug HAVING count(*) > 1
      UNION ALL
      SELECT slug FROM series WHERE slug IS NULL OR slug = '' GROUP BY slug
      UNION ALL
      SELECT slug FROM series GROUP BY slug HAVING count(*) > 1
    `);
    expect(dupes.rows).toEqual([]);
  });

  it('keeps every book version equal to the count and the maximum of its revisions', async () => {
    const drift = await db.execute(sql`
      SELECT b.id FROM books b
        JOIN book_revisions r ON r.book_id = b.id
       GROUP BY b.id, b.version
      HAVING count(r.*) <> b.version OR max(r.version) <> b.version
    `);
    expect(drift.rows).toEqual([]);
  });

  it('keeps every series version equal to the count and the maximum of its revisions', async () => {
    const drift = await db.execute(sql`
      SELECT s.id FROM series s
        JOIN series_revisions r ON r.series_id = s.id
       GROUP BY s.id, s.version
      HAVING count(r.*) <> s.version OR max(r.version) <> s.version
    `);
    expect(drift.rows).toEqual([]);
  });

  it('gives every catalog record at least one revision', async () => {
    const missing = await db.execute(sql`
      SELECT b.id FROM books b
       WHERE NOT EXISTS (SELECT 1 FROM book_revisions r WHERE r.book_id = b.id)
      UNION ALL
      SELECT s.id FROM series s
       WHERE NOT EXISTS (SELECT 1 FROM series_revisions r WHERE r.series_id = s.id)
    `);
    expect(missing.rows).toEqual([]);
  });

  it('agrees with the release-precision rule for every row', async () => {
    const broken = await db.execute(sql`
      SELECT id FROM books
       WHERE (release_precision = 'unknown') <> (release_date IS NULL)
    `);
    expect(broken.rows).toEqual([]);
  });
});
