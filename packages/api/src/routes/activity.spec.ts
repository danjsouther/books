import type { ActivityFeed } from '@books/domain';
import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyAs, buildTestApp, loginTestUser, type TestApp } from '../test-support';

describe.skipIf(!hasDatabase)('Activity', () => {
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

  it('records book.added on create, and status/rating changes on shelf writes', async () => {
    const book = bodyAs<{ id: string }>(
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: 'A Book', authors: [] }),
    );
    await request(testApp.app)
      .patch(`/api/v1/books/${book.id}/me`)
      .set(auth)
      .send({ status: 'reading', rating: 5 });

    const res = bodyAs<ActivityFeed>(await request(testApp.app).get('/api/v1/activity').set(auth));
    const kinds = res.items.map((i) => i.kind);
    expect(kinds).toContain('book.added');
    expect(kinds).toContain('status.changed');
    expect(kinds).toContain('rating.changed');
  });

  it('embeds a hydrated actor and book so the feed needs no follow-up request', async () => {
    await request(testApp.app)
      .post('/api/v1/books')
      .set(auth)
      .send({ title: 'A Book', authors: [] });
    const res = bodyAs<ActivityFeed>(await request(testApp.app).get('/api/v1/activity').set(auth));
    const first = res.items[0];
    expect(first?.actor?.username).toBe('testuser');
    expect(first?.book?.title).toBe('A Book');
  });

  it('paginates by keyset, with nextCursor null on the last page', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(testApp.app)
        .post('/api/v1/books')
        .set(auth)
        .send({ title: `Book ${String(i)}`, authors: [] });
    }
    const first = bodyAs<ActivityFeed>(
      await request(testApp.app).get('/api/v1/activity?limit=2').set(auth),
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = bodyAs<ActivityFeed>(
      await request(testApp.app)
        .get(`/api/v1/activity?limit=2&before=${String(first.nextCursor)}`)
        .set(auth),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
