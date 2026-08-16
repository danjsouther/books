import type { ListResponse, ShelfEntry, UserProfile, UserSummary } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Users', () => {
  let db: Db;
  let pool: Pool;
  let testApp: TestApp;
  let auth: { Authorization: string };
  let userId: string;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
    testApp = buildTestApp(db);
    ({ userId, authHeader: auth } = await loginTestUser(testApp));
  });

  it('lists the signed-in member with their book count and average rating', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'A Book', authors: [] }),
    );
    await request(testApp.app)
      .patch(`/api/v1/books/${book.id}/me`)
      .set(auth)
      .send({ status: 'completed', rating: 6 });

    const res = bodyAs<ListResponse<UserSummary>>(
      await request(testApp.app).get('/api/v1/users').set(auth),
    );
    const me = res.items.find((u) => u.id === userId);
    expect(me?.bookCount).toBe(1);
    expect(me?.avgRating).toBe(6);
  });

  it('reports a profile with status counts', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'A Book', authors: [] }),
    );
    await request(testApp.app)
      .patch(`/api/v1/books/${book.id}/me`)
      .set(auth)
      .send({ status: 'reading' });

    const res = bodyAs<UserProfile>(
      await request(testApp.app).get(`/api/v1/users/${userId}`).set(auth),
    );
    expect(res.statusCounts.reading).toBe(1);
    expect(res.statusCounts.completed).toBe(0);
  });

  it('lists a member’s shelf, filterable by status', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'Shelved Book', authors: [] }),
    );
    await request(testApp.app)
      .patch(`/api/v1/books/${book.id}/me`)
      .set(auth)
      .send({ status: 'backlog' });

    const all = bodyAs<ListResponse<ShelfEntry>>(
      await request(testApp.app).get(`/api/v1/users/${userId}/shelf`).set(auth),
    );
    expect(all.total).toBe(1);
    expect(all.items[0]?.book.title).toBe('Shelved Book');

    const filtered = bodyAs<ListResponse<ShelfEntry>>(
      await request(testApp.app).get(`/api/v1/users/${userId}/shelf?status=reading`).set(auth),
    );
    expect(filtered.total).toBe(0);
  });
});
