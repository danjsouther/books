import type {
  BookSummary,
  FieldDiff,
  ListResponse,
  RevisionSummary,
  SeriesDetail,
} from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

interface BookCreated {
  id: string;
}

describe.skipIf(!hasDatabase)('Series', () => {
  let db: Db;
  let pool: Pool;
  let testApp: TestApp;
  let auth: { Authorization: string };

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
    testApp = buildTestApp(db);
    ({ authHeader: auth } = await loginTestUser(testApp));
  });

  async function createSeries(overrides: Record<string, unknown> = {}): Promise<SeriesDetail> {
    const res = await request(testApp.app)
      .post('/api/v1/series')
      .set(auth)
      .send({ name: 'The Expanse', ...overrides });
    expect(res.status).toBe(201);
    return bodyAs<SeriesDetail>(res);
  }

  async function createBook(
    seriesId: string | null,
    overrides: Record<string, unknown> = {},
  ): Promise<BookCreated> {
    const res = await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'Leviathan Wakes', authors: [], seriesId, ...overrides });
    expect(res.status).toBe(201);
    return bodyAs<BookCreated>(res);
  }

  it('does not enforce name uniqueness — two series may share a name', async () => {
    const first = await createSeries();
    const second = await createSeries();
    expect(first.id).not.toBe(second.id);
  });

  it('404s a missing series', async () => {
    const res = await request(testApp.app)
      .get('/api/v1/series/00000000-0000-0000-0000-000000000000')
      .set(auth);
    expect(res.status).toBe(404);
  });

  it('rejects a create with no name', async () => {
    const res = await request(testApp.app).post('/api/v1/series').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('reports bookCount and nextRelease on the detail response', async () => {
    const series = await createSeries();
    await createBook(series.id, {
      title: 'Upcoming',
      releaseDate: '2099-01-01',
      releasePrecision: 'day',
    });
    const res = bodyAs<SeriesDetail>(
      await request(testApp.app).get(`/api/v1/series/${series.id}`).set(auth),
    );
    expect(res.bookCount).toBe(1);
    expect(res.nextRelease).toBe('2099-01-01');
  });

  it('lists a series’ books', async () => {
    const series = await createSeries();
    await createBook(series.id, { title: 'Book One' });
    await createBook(null, { title: 'Unrelated standalone' });
    const res = bodyAs<ListResponse<BookSummary>>(
      await request(testApp.app).get(`/api/v1/series/${series.id}/books`).set(auth),
    );
    expect(res.total).toBe(1);
    expect(res.items[0]?.title).toBe('Book One');
  });

  // What the series combobox on the book form sends. A single `ILIKE '%q%'`
  // over the whole query never matched here, because the words are not adjacent
  // in the stored name — the search looked broken to anyone typing two words.
  it('matches a multi-word query token by token, in any order', async () => {
    await createSeries({ name: 'The Stormlight Archive' });
    await createSeries({ name: 'The Expanse' });

    async function search(q: string): Promise<string[]> {
      const res = bodyAs<ListResponse<SeriesDetail>>(
        await request(testApp.app)
          .get(`/api/v1/series?q=${encodeURIComponent(q)}`)
          .set(auth),
      );
      return res.items.map((s) => s.name);
    }

    expect(await search('stormlight archive')).toEqual(['The Stormlight Archive']);
    expect(await search('archive stormlight')).toEqual(['The Stormlight Archive']);
    expect(await search('storm arch')).toEqual(['The Stormlight Archive']);
    // AND, not OR: "the" alone matches both, but paired it must narrow.
    expect(await search('the')).toHaveLength(2);
    expect(await search('the stormlight')).toEqual(['The Stormlight Archive']);
    // A wildcard typed into a search box is a literal, not "match everything".
    expect(await search('%')).toEqual([]);
  });

  it('409s a patch carrying a stale version', async () => {
    const series = await createSeries();
    await request(testApp.app)
      .patch(`/api/v1/series/${series.id}`)
      .set(auth)
      .send({ name: 'Renamed once', expectedVersion: series.version });
    const res = await request(testApp.app)
      .patch(`/api/v1/series/${series.id}`)
      .set(auth)
      .send({ name: 'Renamed again', expectedVersion: series.version });
    expect(res.status).toBe(409);
  });

  it('deleting a series does not touch its books, and restoring never restores a deletion', async () => {
    const series = await createSeries();
    const book = await createBook(series.id);

    await request(testApp.app).delete(`/api/v1/series/${series.id}`).set(auth);
    const stillLinked = bodyAs<{ seriesId: string | null }>(
      await request(testApp.app).get(`/api/v1/books/${book.id}`).set(auth),
    );
    expect(stillLinked.seriesId).toBe(series.id);

    const restored = bodyAs<SeriesDetail>(
      await request(testApp.app).post(`/api/v1/series/${series.id}/restore`).set(auth),
    );
    expect(restored.deletedAt).toBeNull();

    await request(testApp.app).delete(`/api/v1/series/${series.id}`).set(auth);
    const revert = bodyAs<SeriesDetail>(
      await request(testApp.app)
        .post(`/api/v1/series/${series.id}/revert`)
        .set(auth)
        .send({ toVersion: 1 }),
    );
    expect(revert.deletedAt).not.toBeNull();
  });

  it('lists and diffs revisions', async () => {
    const series = await createSeries();
    await request(testApp.app)
      .patch(`/api/v1/series/${series.id}`)
      .set(auth)
      .send({ name: 'The Expanse (renamed)', expectedVersion: 1 });

    const list = bodyAs<ListResponse<RevisionSummary>>(
      await request(testApp.app).get(`/api/v1/series/${series.id}/revisions`).set(auth),
    );
    expect(list.total).toBe(2);

    const diff = bodyAs<FieldDiff[]>(
      await request(testApp.app)
        .get(`/api/v1/series/${series.id}/revisions/2/diff?against=1`)
        .set(auth),
    );
    expect(diff.map((d) => d.field)).toContain('name');
  });
});
