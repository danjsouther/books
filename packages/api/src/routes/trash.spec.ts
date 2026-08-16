import type { ListResponse, TrashItem } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Trash', () => {
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

  it('unions deleted books and series, and excludes live records', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'Trashed Book', authors: [] }),
    );
    await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'Live Book', authors: [] });
    const series = bodyAs<{ id: string }>(
      await request(testApp.app).post('/api/v1/series').set(auth).send({ name: 'Trashed Series' }),
    );

    await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
    await request(testApp.app).delete(`/api/v1/series/${series.id}`).set(auth);

    const res = bodyAs<ListResponse<TrashItem>>(
      await request(testApp.app).get('/api/v1/trash').set(auth),
    );
    expect(res.total).toBe(2);
    const titles = res.items.map((i) => i.title).sort();
    expect(titles).toEqual(['Trashed Book', 'Trashed Series']);
  });

  it('filters by type', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'Trashed Book', authors: [] }),
    );
    await request(testApp.app).delete(`/api/v1/books/${book.id}`).set(auth);
    await request(testApp.app).post('/api/v1/series').set(auth).send({ name: 'Live Series' });

    const res = bodyAs<ListResponse<TrashItem>>(
      await request(testApp.app).get('/api/v1/trash?type=series').set(auth),
    );
    expect(res.total).toBe(0);
  });
});
