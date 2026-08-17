import { schema, type Db } from '@books/db';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listBooks } from './books';

const { books, bookUserStatus } = schema;

describe.skipIf(!hasDatabase)('listBooks sort=rating', () => {
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

  // The bug this guards against: `SORT_COLUMNS.rating` used to alias
  // `books.title`, so asking for "Rating" silently sorted alphabetically —
  // the ordering below (worst-titled book has the best rating) only comes
  // out right if the average-rating subquery is actually being used.
  it('orders by average rating, not by title', async () => {
    const userId = await createTestUser(db, 'rater');

    const [zBook] = await db.insert(books).values({ title: 'Z Book' }).returning({ id: books.id });
    const [aBook] = await db.insert(books).values({ title: 'A Book' }).returning({ id: books.id });
    if (!zBook || !aBook) throw new Error('Book insert failed.');

    await db.insert(bookUserStatus).values([
      { bookId: zBook.id, userId, rating: 10 },
      { bookId: aBook.id, userId, rating: 2 },
    ]);

    const { items } = await listBooks(db, {
      page: 1,
      pageSize: 20,
      dir: 'desc',
      includeDeleted: false,
      sort: 'rating',
    });

    expect(items.map((b) => b.title)).toEqual(['Z Book', 'A Book']);
  });

  it('sorts unrated books last under desc, without erroring', async () => {
    const userId = await createTestUser(db, 'rater2');

    const [rated] = await db.insert(books).values({ title: 'Rated' }).returning({ id: books.id });
    await db.insert(books).values({ title: 'Unrated' });
    if (!rated) throw new Error('Book insert failed.');

    await db.insert(bookUserStatus).values({ bookId: rated.id, userId, rating: 5 });

    const { items } = await listBooks(db, {
      page: 1,
      pageSize: 20,
      dir: 'desc',
      includeDeleted: false,
      sort: 'rating',
    });

    expect(items.map((b) => b.title)).toEqual(['Rated', 'Unrated']);
  });
});
