import { schema, type Db } from '@books/db';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '@books/db/test-support';
import { slugify } from '@books/domain';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listUpcomingReleases } from './releases';

const { books, series, bookUserStatus } = schema;

const WINDOW = { from: '2027-03-01', to: '2027-03-31' };

async function insertBook(
  db: Db,
  overrides: Partial<{
    title: string;
    releaseDate: string;
    releasePrecision: 'day' | 'month' | 'year' | 'unknown';
    seriesId: string;
    seriesPosition: string;
    deletedAt: Date;
  }>,
): Promise<string> {
  const title = overrides.title ?? 'A Book';
  const [row] = await db
    .insert(books)
    .values({
      title,
      slug: slugify(title),
      releaseDate: overrides.releaseDate ?? null,
      releasePrecision: overrides.releasePrecision ?? 'day',
      ...(overrides.seriesId !== undefined && { seriesId: overrides.seriesId }),
      ...(overrides.seriesPosition !== undefined && { seriesPosition: overrides.seriesPosition }),
      ...(overrides.deletedAt !== undefined && { deletedAt: overrides.deletedAt }),
    })
    .returning({ id: books.id });
  if (row === undefined) throw new Error('Insert returned no row.');
  return row.id;
}

describe.skipIf(!hasDatabase)('listUpcomingReleases', () => {
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

  it('excludes a soft-deleted book', async () => {
    await insertBook(db, {
      title: 'Trashed',
      releaseDate: '2027-03-05',
      deletedAt: new Date(),
    });
    const results = await listUpcomingReleases(db, { ...WINDOW, includeTba: false });
    expect(results).toHaveLength(0);
  });

  it('includes only day-precision books by default', async () => {
    await insertBook(db, { title: 'Day', releaseDate: '2027-03-05', releasePrecision: 'day' });
    await insertBook(db, { title: 'Month', releaseDate: '2027-03-01', releasePrecision: 'month' });
    await insertBook(db, { title: 'Year', releaseDate: '2027-01-01', releasePrecision: 'year' });

    const results = await listUpcomingReleases(db, { ...WINDOW, includeTba: false });
    expect(results.map((r) => r.title)).toEqual(['Day']);
  });

  it('includeTba adds month/year-precision books', async () => {
    await insertBook(db, { title: 'Day', releaseDate: '2027-03-05', releasePrecision: 'day' });
    await insertBook(db, { title: 'Month', releaseDate: '2027-03-01', releasePrecision: 'month' });

    const results = await listUpcomingReleases(db, { ...WINDOW, includeTba: true });
    expect(results.map((r) => r.title).sort()).toEqual(['Day', 'Month']);
  });

  it('narrows by seriesId', async () => {
    const [seriesRow] = await db
      .insert(series)
      .values({ name: 'The Expanse', slug: slugify('The Expanse') })
      .returning({
        id: series.id,
      });
    if (seriesRow === undefined) throw new Error('no series row');

    await insertBook(db, {
      title: 'In Series',
      releaseDate: '2027-03-05',
      seriesId: seriesRow.id,
      seriesPosition: '1',
    });
    await insertBook(db, { title: 'Standalone', releaseDate: '2027-03-06' });

    const results = await listUpcomingReleases(db, {
      ...WINDOW,
      includeTba: false,
      seriesId: seriesRow.id,
    });
    expect(results.map((r) => r.title)).toEqual(['In Series']);
    expect(results[0]?.seriesName).toBe('The Expanse');
    expect(results[0]?.seriesPosition).toBe('1.00');
  });

  it("narrows to mineUserId's planned books, excluding another member's", async () => {
    const viewerId = await createTestUser(db, 'viewer');
    const otherId = await createTestUser(db, 'other');
    const plannedByViewer = await insertBook(db, {
      title: 'Planned by viewer',
      releaseDate: '2027-03-05',
    });
    const plannedByOther = await insertBook(db, {
      title: 'Planned by other',
      releaseDate: '2027-03-06',
    });

    await db
      .insert(bookUserStatus)
      .values({ bookId: plannedByViewer, userId: viewerId, status: 'plan' });
    await db
      .insert(bookUserStatus)
      .values({ bookId: plannedByOther, userId: otherId, status: 'plan' });

    const results = await listUpcomingReleases(db, {
      ...WINDOW,
      includeTba: false,
      mineUserId: viewerId,
    });
    expect(results.map((r) => r.title)).toEqual(['Planned by viewer']);
  });

  it('orders by release date, then title', async () => {
    await insertBook(db, { title: 'Zebra', releaseDate: '2027-03-01' });
    await insertBook(db, { title: 'Apple', releaseDate: '2027-03-01' });
    await insertBook(db, { title: 'Middle', releaseDate: '2027-03-15' });

    const results = await listUpcomingReleases(db, { ...WINDOW, includeTba: false });
    expect(results.map((r) => r.title)).toEqual(['Apple', 'Zebra', 'Middle']);
  });
});
