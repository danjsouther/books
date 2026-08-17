import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../client';
import { authorBooks } from '../schema/author-books';
import { authors } from '../schema/authors';
import { books } from '../schema/books';
import { connectForTests, hasDatabase, truncateAll } from '../test-support';
import {
  authorsOfBook,
  listAuthors,
  normalizeAuthorNames,
  resolveAuthors,
  syncAuthorBooks,
} from './authors';

describe('normalizeAuthorNames', () => {
  it('trims, drops blanks, and collapses repeats case-insensitively', () => {
    expect(normalizeAuthorNames(['  Martha Wells ', '', '   ', 'martha wells', 'Ali'])).toEqual([
      'Martha Wells',
      'Ali',
    ]);
  });

  it('preserves the credited order rather than sorting', () => {
    expect(normalizeAuthorNames(['Terry Pratchett', 'Stephen Baxter'])).toEqual([
      'Terry Pratchett',
      'Stephen Baxter',
    ]);
  });
});

describe.skipIf(!hasDatabase)('author resolution and linking', () => {
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
    const [row] = await db.insert(books).values({ title }).returning({ id: books.id });
    if (row === undefined) throw new Error('no book');
    return row.id;
  }

  it('creates an author on first use and reuses the row on the second', async () => {
    const first = await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells']));
    const second = await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells']));

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(await db.select().from(authors)).toHaveLength(1);
  });

  it('folds a differently-cased name onto the existing row', async () => {
    await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells']));
    const again = await db.transaction((tx) => resolveAuthors(tx, ['martha wells']));

    const rows = await db.select().from(authors);
    expect(rows).toHaveLength(1);
    // The stored name is the one first written; resolution does not rewrite it.
    expect(rows[0]?.name).toBe('Martha Wells');
    expect(again[0]?.id).toBe(rows[0]?.id);
  });

  it('resolves the same new name concurrently into one row without erroring', async () => {
    // The unique index arbitrates; the loser's insert is declined and the re-select
    // picks up the winner's row.
    const [a, b] = await Promise.all([
      db.transaction((tx) => resolveAuthors(tx, ['Simultaneous'])),
      db.transaction((tx) => resolveAuthors(tx, ['Simultaneous'])),
    ]);

    expect(await db.select().from(authors)).toHaveLength(1);
    expect(a[0]?.id).toBe(b[0]?.id);
  });

  it('keeps the credited order rather than alphabetical', async () => {
    const bookId = await newBook('The Long Earth');
    await db.transaction(async (tx) => {
      const resolved = await resolveAuthors(tx, ['Terry Pratchett', 'Stephen Baxter']);
      await syncAuthorBooks(tx, bookId, resolved);
    });

    const credited = await authorsOfBook(db, bookId);
    expect(credited.map((a) => a.name)).toEqual(['Terry Pratchett', 'Stephen Baxter']);
  });

  it('rewrites positions when the same authors are reordered', async () => {
    const bookId = await newBook('Reordered');
    await db.transaction(async (tx) => {
      await syncAuthorBooks(tx, bookId, await resolveAuthors(tx, ['A One', 'B Two']));
    });
    await db.transaction(async (tx) => {
      await syncAuthorBooks(tx, bookId, await resolveAuthors(tx, ['B Two', 'A One']));
    });

    expect((await authorsOfBook(db, bookId)).map((a) => a.name)).toEqual(['B Two', 'A One']);
    // Membership did not change, so no rows were added or removed.
    expect(await db.select().from(authorBooks).where(eq(authorBooks.bookId, bookId))).toHaveLength(
      2,
    );
  });

  it('detaches an author without deleting the author row', async () => {
    const bookId = await newBook('Trimmed');
    await db.transaction(async (tx) => {
      await syncAuthorBooks(tx, bookId, await resolveAuthors(tx, ['Kept', 'Dropped']));
    });
    await db.transaction(async (tx) => {
      await syncAuthorBooks(tx, bookId, await resolveAuthors(tx, ['Kept']));
    });

    expect((await authorsOfBook(db, bookId)).map((a) => a.name)).toEqual(['Kept']);
    expect(await db.select().from(authors)).toHaveLength(2);
  });

  it('detaches from one book without touching another book by the same author', async () => {
    const kept = await newBook('Kept Book');
    const trimmed = await newBook('Trimmed Book');
    await db.transaction(async (tx) => {
      const shared = await resolveAuthors(tx, ['Shared Author']);
      await syncAuthorBooks(tx, kept, shared);
      await syncAuthorBooks(tx, trimmed, shared);
    });
    await db.transaction(async (tx) => {
      await syncAuthorBooks(tx, trimmed, []);
    });

    expect(await authorsOfBook(db, kept)).toHaveLength(1);
    expect(await authorsOfBook(db, trimmed)).toHaveLength(0);
  });

  it('finds authors by a leading fragment for autocomplete', async () => {
    await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells', 'Marlon James', 'Ali Smith']));

    const matches = await listAuthors(db, 'mar');
    expect(matches.map((a) => a.name)).toEqual(['Marlon James', 'Martha Wells']);
  });

  // The old prefix match failed the most natural thing a member types: a
  // surname, or the words of a name in any order.
  it('finds authors by surname and by out-of-order tokens', async () => {
    await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells', 'Marlon James', 'Ali Smith']));

    expect((await listAuthors(db, 'wells')).map((a) => a.name)).toEqual(['Martha Wells']);
    expect((await listAuthors(db, 'wells martha')).map((a) => a.name)).toEqual(['Martha Wells']);
    // Every token must match — this is an AND, not an OR.
    expect(await listAuthors(db, 'martha james')).toEqual([]);
  });

  it('treats LIKE metacharacters in the query as literal text', async () => {
    await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells', 'Marlon James']));

    expect(await listAuthors(db, '%')).toEqual([]);
    expect(await listAuthors(db, '_')).toEqual([]);
  });

  it('returns everything for a blank or whitespace-only query', async () => {
    await db.transaction((tx) => resolveAuthors(tx, ['Martha Wells', 'Marlon James']));

    expect(await listAuthors(db, '')).toHaveLength(2);
    expect(await listAuthors(db, '   ')).toHaveLength(2);
  });
});
