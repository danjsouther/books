import { schema, type Db } from '@books/db';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '@books/db/test-support';
import { slugify } from '@books/domain';
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

    const [zBook] = await db
      .insert(books)
      .values({ title: 'Z Book', slug: slugify('Z Book') })
      .returning({ id: books.id });
    const [aBook] = await db
      .insert(books)
      .values({ title: 'A Book', slug: slugify('A Book') })
      .returning({ id: books.id });
    if (!zBook || !aBook) throw new Error('Book insert failed.');

    await db.insert(bookUserStatus).values([
      { bookId: zBook.id, userId, rating: 10 },
      { bookId: aBook.id, userId, rating: 2 },
    ]);

    const { items } = await listBooks(
      db,
      {
        page: 1,
        pageSize: 20,
        dir: 'desc',
        includeDeleted: false,
        sort: 'rating',
      },
      userId,
    );

    expect(items.map((b) => b.title)).toEqual(['Z Book', 'A Book']);
  });

  it('sorts unrated books last under desc, without erroring', async () => {
    const userId = await createTestUser(db, 'rater2');

    const [rated] = await db
      .insert(books)
      .values({ title: 'Rated', slug: slugify('Rated') })
      .returning({ id: books.id });
    await db.insert(books).values({ title: 'Unrated', slug: slugify('Unrated') });
    if (!rated) throw new Error('Book insert failed.');

    await db.insert(bookUserStatus).values({ bookId: rated.id, userId, rating: 5 });

    const { items } = await listBooks(
      db,
      {
        page: 1,
        pageSize: 20,
        dir: 'desc',
        includeDeleted: false,
        sort: 'rating',
      },
      userId,
    );

    expect(items.map((b) => b.title)).toEqual(['Rated', 'Unrated']);
  });
});

describe.skipIf(!hasDatabase)('listBooks filter=status', () => {
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

  // The bug this guards against: filtering by status matched *any* member's
  // shelf entry, so one user's "reading" filter leaked in books only some
  // other member had marked reading.
  it("only matches the viewer's own shelf status, not another member's", async () => {
    const viewer = await createTestUser(db, 'viewer');
    const other = await createTestUser(db, 'other');

    const [mine] = await db
      .insert(books)
      .values({ title: 'Mine', slug: slugify('Mine') })
      .returning({ id: books.id });
    const [theirs] = await db
      .insert(books)
      .values({ title: 'Theirs', slug: slugify('Theirs') })
      .returning({ id: books.id });
    if (!mine || !theirs) throw new Error('Book insert failed.');

    await db.insert(bookUserStatus).values([
      { bookId: mine.id, userId: viewer, status: 'reading' },
      { bookId: theirs.id, userId: other, status: 'reading' },
    ]);

    const { items } = await listBooks(
      db,
      {
        page: 1,
        pageSize: 20,
        dir: 'asc',
        includeDeleted: false,
        sort: 'title',
        status: 'reading',
      },
      viewer,
    );

    expect(items.map((b) => b.title)).toEqual(['Mine']);
  });
});
