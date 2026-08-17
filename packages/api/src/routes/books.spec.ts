import type {
  BookDetail,
  BookSummary,
  FieldDiff,
  ListResponse,
  Revision,
  RevisionSummary,
} from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

interface ErrorBody {
  error: { code: string; message: string; details?: { reason?: string } };
}

describe.skipIf(!hasDatabase)('Books', () => {
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

  async function createBook(overrides: Record<string, unknown> = {}): Promise<BookDetail> {
    const res = await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'Leviathan Wakes', authors: ['James S. A. Corey'], ...overrides });
    expect(res.status).toBe(201);
    return bodyAs<BookDetail>(res);
  }

  describe('list', () => {
    it('filters by title, and pages the response', async () => {
      await createBook({ title: 'Way of Kings' });
      await createBook({ title: 'Words of Radiance' });
      const res = await request(testApp.app).get('/api/v1/books?q=way').set(auth);
      const body = bodyAs<ListResponse<BookDetail>>(res);
      expect(res.status).toBe(200);
      expect(body.total).toBe(1);
      expect(body.items[0]?.title).toBe('Way of Kings');
    });

    it('filters by author name, case-insensitively', async () => {
      await createBook({ authors: ['N. K. Jemisin'] });
      const hit = bodyAs<ListResponse<BookDetail>>(
        await request(testApp.app).get('/api/v1/books?author=n.%20k.%20jemisin').set(auth),
      );
      expect(hit.total).toBe(1);
      const miss = bodyAs<ListResponse<BookDetail>>(
        await request(testApp.app).get('/api/v1/books?author=nobody').set(auth),
      );
      expect(miss.total).toBe(0);
    });

    it('names each listed book’s series, so a list needs no second lookup', async () => {
      const series = bodyAs<{ id: string }>(
        await request(testApp.app).post('/api/v1/series').set(auth).send({ name: 'The Expanse' }),
      );
      await createBook({ seriesId: series.id, seriesPosition: '1' });
      await createBook({ title: 'Standalone' });

      const body = bodyAs<ListResponse<BookSummary>>(
        await request(testApp.app).get('/api/v1/books?sort=title').set(auth),
      );
      const inSeries = body.items.find((b) => b.title === 'Leviathan Wakes');
      const standalone = body.items.find((b) => b.title === 'Standalone');
      expect(inSeries?.seriesName).toBe('The Expanse');
      expect(standalone?.seriesName).toBeNull();
    });

    it('excludes deleted books by default and includes them with includeDeleted', async () => {
      const book = await createBook();
      await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
      const live = bodyAs<ListResponse<BookDetail>>(
        await request(testApp.app).get('/api/v1/books').set(auth),
      );
      expect(live.total).toBe(0);
      const all = bodyAs<ListResponse<BookDetail>>(
        await request(testApp.app).get('/api/v1/books?includeDeleted=true').set(auth),
      );
      expect(all.total).toBe(1);
    });
  });

  it('404s a missing book', async () => {
    const res = await request(testApp.app)
      .get('/api/v1/books/00000000-0000-0000-0000-000000000000')
      .set(auth);
    expect(res.status).toBe(404);
    expect(bodyAs<ErrorBody>(res).error.code).toBe('not_found');
  });

  it('rejects a create with no title', async () => {
    const res = await request(testApp.app).post('/api/v1/books').set(auth).send({ authors: [] });
    expect(res.status).toBe(400);
    expect(bodyAs<ErrorBody>(res).error.code).toBe('validation_failed');
  });

  it('resolves authors in credited order on the detail response', async () => {
    const book = await createBook({ authors: ['Terry Pratchett', 'Stephen Baxter'] });
    const res = await request(testApp.app).get(`/api/v1/books/${book.id}`).set(auth);
    expect(bodyAs<BookDetail>(res).authors.map((a) => a.name)).toEqual([
      'Terry Pratchett',
      'Stephen Baxter',
    ]);
  });

  describe('patch and concurrency', () => {
    it('accepts a patch carrying the current version', async () => {
      const book = await createBook();
      const res = await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ title: 'Leviathan Wakes (revised)', expectedVersion: book.version });
      const body = bodyAs<BookDetail>(res);
      expect(res.status).toBe(200);
      expect(body.title).toBe('Leviathan Wakes (revised)');
      expect(body.version).toBe(2);
    });

    it('409s a patch carrying a stale version', async () => {
      const book = await createBook();
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ title: 'First edit', expectedVersion: book.version });

      const res = await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ title: 'Conflicting edit', expectedVersion: book.version });
      expect(res.status).toBe(409);
      expect(bodyAs<ErrorBody>(res).error.details?.reason).toBe('stale_version');
    });

    it('leaves authors alone when a patch says nothing about them', async () => {
      const book = await createBook({ authors: ['James S. A. Corey'] });
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ subtitle: 'Book One', expectedVersion: book.version });
      const res = await request(testApp.app).get(`/api/v1/books/${book.id}`).set(auth);
      expect(bodyAs<BookDetail>(res).authors).toHaveLength(1);
    });
  });

  describe('delete and restore', () => {
    it('soft-deletes then restores', async () => {
      const book = await createBook();
      const del = await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
      expect(del.status).toBe(204);

      const gone = await request(testApp.app).get(`/api/v1/books/${book.id}`).set(auth);
      expect(bodyAs<BookDetail>(gone).deletedAt).not.toBeNull();

      const restored = await request(testApp.app)
        .post(`/api/v1/books/${book.id}/restore`)
        .set(auth);
      expect(restored.status).toBe(200);
      expect(bodyAs<BookDetail>(restored).deletedAt).toBeNull();
    });

    it('409s a restore that would collide with a live ASIN', async () => {
      const book = await createBook({ asin: '0316129089' });
      await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
      await createBook({ title: 'A new book', asin: '0316129089' });

      const res = await request(testApp.app).post(`/api/v1/books/${book.id}/restore`).set(auth);
      expect(res.status).toBe(409);
    });
  });

  describe('revisions and revert', () => {
    it('lists revisions and fetches one by version', async () => {
      const book = await createBook();
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ title: 'Edited', expectedVersion: 1 });

      const list = bodyAs<ListResponse<RevisionSummary>>(
        await request(testApp.app).get(`/api/v1/books/${book.id}/revisions`).set(auth),
      );
      expect(list.total).toBe(2);

      const v1 = await request(testApp.app).get(`/api/v1/books/${book.id}/revisions/1`).set(auth);
      expect(v1.status).toBe(200);
      const snapshot = bodyAs<Revision>(v1).snapshot as { title: string };
      expect(snapshot.title).toBe('Leviathan Wakes');
    });

    it('diffs two versions down to the fields that actually changed', async () => {
      const book = await createBook();
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}`)
        .set(auth)
        .send({ title: 'Edited Title', expectedVersion: 1 });

      const res = await request(testApp.app)
        .get(`/api/v1/books/${book.id}/revisions/2/diff?against=1`)
        .set(auth);
      expect(res.status).toBe(200);
      const fields = bodyAs<FieldDiff[]>(res).map((d) => d.field);
      expect(fields).toContain('title');
    });

    it('reverting never restores a deletion', async () => {
      const book = await createBook();
      await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
      const revert = await request(testApp.app)
        .post(`/api/v1/books/${book.id}/revert`)
        .set(auth)
        .send({ toVersion: 1 });
      expect(revert.status).toBe(200);
      expect(bodyAs<BookDetail>(revert).deletedAt).not.toBeNull();
    });
  });

  describe('shelf sub-routes', () => {
    it('has no status until one is set', async () => {
      const book = await createBook();
      const res = await request(testApp.app).get(`/api/v1/books/${book.id}/me`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('upserts status and rating, and clears the rating with null', async () => {
      const book = await createBook();
      const set = await request(testApp.app)
        .patch(`/api/v1/books/${book.id}/me`)
        .set(auth)
        .send({ status: 'reading', rating: 8 });
      const setBody = bodyAs<{ status: string; rating: number | null }>(set);
      expect(set.status).toBe(200);
      expect(setBody.status).toBe('reading');
      expect(setBody.rating).toBe(8);

      const cleared = await request(testApp.app)
        .patch(`/api/v1/books/${book.id}/me`)
        .set(auth)
        .send({ rating: null });
      const clearedBody = bodyAs<{ status: string; rating: number | null }>(cleared);
      expect(clearedBody.rating).toBeNull();
      expect(clearedBody.status).toBe('reading');
    });

    it('shows up in ratingSummary and statuses once set', async () => {
      const book = await createBook();
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}/me`)
        .set(auth)
        .send({ status: 'completed', rating: 9 });

      const detail = bodyAs<BookDetail>(
        await request(testApp.app).get(`/api/v1/books/${book.id}`).set(auth),
      );
      expect(detail.ratingSummary).toMatchObject({ average: 9, count: 1 });
      expect(detail.myStatus?.rating).toBe(9);
      expect(detail.statuses).toHaveLength(1);
    });

    it('removes the shelf entry entirely', async () => {
      const book = await createBook();
      await request(testApp.app)
        .patch(`/api/v1/books/${book.id}/me`)
        .set(auth)
        .send({ status: 'backlog' });
      const del = await request(testApp.app).delete(`/api/v1/books/${book.id}/me`).set(auth);
      expect(del.status).toBe(204);
      const after = await request(testApp.app).get(`/api/v1/books/${book.id}/me`).set(auth);
      expect(after.body).toBeNull();
    });
  });
});
