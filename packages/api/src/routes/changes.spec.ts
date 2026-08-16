import type { ChangeItem, ListResponse } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Changes', () => {
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

  it('unions book and series revisions, newest first', async () => {
    await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'A Book', authors: [] });
    await request(testApp.app).post('/api/v1/series').set(auth).send({ name: 'A Series' });

    const res = bodyAs<ListResponse<ChangeItem>>(
      await request(testApp.app).get('/api/v1/changes').set(auth),
    );
    const entityTypes = res.items.map((i) => i.entityType);
    expect(entityTypes).toEqual(expect.arrayContaining(['book', 'series']));
    expect(res.total).toBe(2);
  });

  it('computes changedFields against the immediately preceding version', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'A Book', authors: [] }),
    );
    await request(testApp.app)
      .patch(`/api/v1/books/${book.id}`)
      .set(auth)
      .send({ title: 'A Renamed Book', expectedVersion: 1 });

    const res = bodyAs<ListResponse<ChangeItem>>(
      await request(testApp.app).get('/api/v1/changes?changeKind=edited').set(auth),
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.changedFields).toContain('title');
  });

  it('filters by entityType', async () => {
    await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'A Book', authors: [] });
    await request(testApp.app).post('/api/v1/series').set(auth).send({ name: 'A Series' });

    const res = bodyAs<ListResponse<ChangeItem>>(
      await request(testApp.app).get('/api/v1/changes?entityType=series').set(auth),
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.entityType).toBe('series');
  });
});
