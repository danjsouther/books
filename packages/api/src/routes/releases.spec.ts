import type { ReleasesResponse } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Releases', () => {
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

  async function createBook(overrides: Record<string, unknown>): Promise<{ id: string }> {
    const res = await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'A Book', authors: [], ...overrides });
    expect(res.status).toBe(201);
    return bodyAs<{ id: string }>(res);
  }

  it('buckets books by precision within the window', async () => {
    await createBook({ title: 'Day', releaseDate: '2030-06-15', releasePrecision: 'day' });
    await createBook({ title: 'Month', releaseDate: '2030-07-01', releasePrecision: 'month' });
    await createBook({ title: 'Year', releaseDate: '2030-01-01', releasePrecision: 'year' });
    await createBook({ title: 'No date' }); // unknown precision, excluded unless includeUndated

    const res = await request(testApp.app)
      .get('/api/v1/releases?from=2030-01-01&to=2030-12-31')
      .set(auth);
    const body = bodyAs<ReleasesResponse>(res);
    expect(res.status).toBe(200);
    expect(body.dated.map((b) => b.title)).toEqual(['Day']);
    expect(body.monthly.map((b) => b.title)).toEqual(['Month']);
    expect(body.yearly.map((b) => b.title)).toEqual(['Year']);
    expect(body.undated).toEqual([]);
  });

  it('includes undated books only when asked', async () => {
    await createBook({ title: 'No date' });
    const without = bodyAs<ReleasesResponse>(
      await request(testApp.app).get('/api/v1/releases?from=2030-01-01&to=2030-12-31').set(auth),
    );
    expect(without.undated).toEqual([]);

    const withUndated = bodyAs<ReleasesResponse>(
      await request(testApp.app)
        .get('/api/v1/releases?from=2030-01-01&to=2030-12-31&includeUndated=true')
        .set(auth),
    );
    expect(withUndated.undated).toHaveLength(1);
  });

  it('restricts to the viewer’s plan shelf with mine=true', async () => {
    const planned = await createBook({
      title: 'Planned',
      releaseDate: '2030-06-15',
      releasePrecision: 'day',
    });
    await createBook({ title: 'Not planned', releaseDate: '2030-06-16', releasePrecision: 'day' });
    await request(testApp.app)
      .patch(`/api/v1/books/${planned.id}/me`)
      .set(auth)
      .send({ status: 'plan' });

    const res = bodyAs<ReleasesResponse>(
      await request(testApp.app)
        .get('/api/v1/releases?from=2030-01-01&to=2030-12-31&mine=true')
        .set(auth),
    );
    expect(res.dated.map((b) => b.title)).toEqual(['Planned']);
  });
});
