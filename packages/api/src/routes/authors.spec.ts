import type { Author } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Authors', () => {
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

  it('autocompletes by name prefix, case-insensitively', async () => {
    await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'A Book', authors: ['Martha Wells'] });

    const hit = bodyAs<Author[]>(await request(testApp.app).get('/api/v1/authors?q=mar').set(auth));
    expect(hit).toHaveLength(1);
    expect(hit[0]?.name).toBe('Martha Wells');

    const miss = bodyAs<Author[]>(
      await request(testApp.app).get('/api/v1/authors?q=zzz').set(auth),
    );
    expect(miss).toHaveLength(0);
  });
});
