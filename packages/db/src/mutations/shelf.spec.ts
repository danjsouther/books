import { slugify } from '@books/domain';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../client';
import { books } from '../schema/books';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '../test-support';
import { getShelfStatus, upsertShelfStatus } from './shelf';

describe.skipIf(!hasDatabase)('upsertShelfStatus: percentRead vs. completion', () => {
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

  async function newBook(title: string): Promise<string> {
    const [row] = await db
      .insert(books)
      .values({ title, slug: slugify(title) })
      .returning({ id: books.id });
    if (row === undefined) throw new Error('no book');
    return row.id;
  }

  it('forces percentRead to 100 when marking a book completed', async () => {
    const userId = await createTestUser(db);
    const bookId = await newBook('Finished Off');

    await upsertShelfStatus(db, bookId, userId, { status: 'reading', percentRead: 30 });
    await upsertShelfStatus(db, bookId, userId, { status: 'completed' });

    const row = await getShelfStatus(db, bookId, userId);
    expect(row?.percentRead).toBe(100);
  });

  it('overrides an explicit percentRead in the same patch that completes a book', async () => {
    const userId = await createTestUser(db);
    const bookId = await newBook('Explicit Override');

    await upsertShelfStatus(db, bookId, userId, { status: 'completed', percentRead: 40 });

    const row = await getShelfStatus(db, bookId, userId);
    expect(row?.percentRead).toBe(100);
  });

  it('does not touch percentRead for any other status change', async () => {
    const userId = await createTestUser(db);
    const bookId = await newBook('Still Reading');

    await upsertShelfStatus(db, bookId, userId, { status: 'reading', percentRead: 55 });
    await upsertShelfStatus(db, bookId, userId, { status: 'dropped' });

    const row = await getShelfStatus(db, bookId, userId);
    expect(row?.percentRead).toBe(55);
  });
});
