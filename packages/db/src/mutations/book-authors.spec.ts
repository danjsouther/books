import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../client';
import { authors } from '../schema/authors';
import { bookRevisions } from '../schema/revisions';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '../test-support';
import { authorsOfBook, type AuthorRef } from './authors';
import { createBook, deleteBook, restoreBook, revertBook, updateBook } from './books';
import type { BookInput } from './books';
import type { Actor } from './with-revision';

function bookInput(title: string, authorNames: string[] = []): BookInput {
  return {
    title,
    subtitle: null,
    description: null,
    authors: authorNames,
    seriesId: null,
    seriesPosition: null,
    releaseDate: null,
    releasePrecision: 'unknown',
    pageCount: null,
    asin: null,
    coverUrl: null,
    deletedAt: null,
    deletedBy: null,
  };
}

describe.skipIf(!hasDatabase)('a book carries its authors through history', () => {
  let db: Db;
  let pool: Pool;
  let actor: Actor;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
    actor = { id: await createTestUser(db, 'writer') };
  });

  /** The author names as one revision recorded them — the point being that this
   *  survives even though the books table has no authors column. */
  async function snapshotAuthors(bookId: string, version: number): Promise<string[]> {
    const [row] = await db
      .select({ snapshot: bookRevisions.snapshot })
      .from(bookRevisions)
      .where(and(eq(bookRevisions.bookId, bookId), eq(bookRevisions.version, version)))
      .limit(1);
    const snapshot = row?.snapshot as { authors?: AuthorRef[] } | undefined;
    return (snapshot?.authors ?? []).map((a) => a.name);
  }

  it('links the authors named at creation, in order', async () => {
    const created = await createBook(
      db,
      bookInput('Good Omens', ['Neil Gaiman', 'T Pratchett']),
      actor,
    );

    expect((await authorsOfBook(db, created.id)).map((a) => a.name)).toEqual([
      'Neil Gaiman',
      'T Pratchett',
    ]);
  });

  it('records the author set in the creating revision', async () => {
    const created = await createBook(db, bookInput('Solo', ['Only Author']), actor);
    expect(await snapshotAuthors(created.id, 1)).toEqual(['Only Author']);
  });

  it('treats an author change as a book edit, bumping the version once', async () => {
    const created = await createBook(db, bookInput('Changing', ['First Author']), actor);
    const edited = await updateBook(
      db,
      created.id,
      { authors: ['First Author', 'Second Author'] },
      actor,
    );

    expect(edited.version).toBe(2);
    const revisions = await db
      .select()
      .from(bookRevisions)
      .where(eq(bookRevisions.bookId, created.id));
    expect(revisions).toHaveLength(2);
  });

  it('makes the change visible as a difference between two snapshots', async () => {
    const created = await createBook(db, bookInput('Changing', ['First Author']), actor);
    await updateBook(db, created.id, { authors: ['First Author', 'Second Author'] }, actor);

    expect(await snapshotAuthors(created.id, 1)).toEqual(['First Author']);
    expect(await snapshotAuthors(created.id, 2)).toEqual(['First Author', 'Second Author']);
  });

  it('leaves the authors alone when a patch says nothing about them', async () => {
    const created = await createBook(db, bookInput('Untouched', ['Kept Author']), actor);
    await updateBook(db, created.id, { pageCount: 300 }, actor);

    expect((await authorsOfBook(db, created.id)).map((a) => a.name)).toEqual(['Kept Author']);
    expect(await snapshotAuthors(created.id, 2)).toEqual(['Kept Author']);
  });

  it('restores the previous author set on revert, reusing the same rows', async () => {
    const created = await createBook(db, bookInput('Reverted', ['Original Author']), actor);
    const [before] = await db.select().from(authors);
    await updateBook(db, created.id, { authors: ['Replacement Author'] }, actor);

    const reverted = await revertBook(db, created.id, 1, actor);

    expect(reverted.version).toBe(3);
    const current = await authorsOfBook(db, created.id);
    expect(current.map((a) => a.name)).toEqual(['Original Author']);
    expect(current[0]?.id).toBe(before?.id);
  });

  it('keeps the authors attached across a delete and restore', async () => {
    const created = await createBook(db, bookInput('Trashed', ['Persistent Author']), actor);
    await deleteBook(db, created.id, actor);
    expect((await authorsOfBook(db, created.id)).map((a) => a.name)).toEqual(['Persistent Author']);

    await restoreBook(db, created.id, actor);
    expect((await authorsOfBook(db, created.id)).map((a) => a.name)).toEqual(['Persistent Author']);
  });

  it('shares one author row between two books', async () => {
    await createBook(db, bookInput('One', ['Shared Author']), actor);
    await createBook(db, bookInput('Two', ['shared author']), actor);

    expect(await db.select().from(authors)).toHaveLength(1);
  });
});
