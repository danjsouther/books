import { AppError } from '@books/domain';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../client';
import { activeBooks, activeSeries } from '../queries/active';
import { activity } from '../schema/activity';
import { books } from '../schema/books';
import { bookRevisions, seriesRevisions } from '../schema/revisions';
import { connectForTests, createTestUser, hasDatabase, truncateAll } from '../test-support';
import { createBook, deleteBook, restoreBook, revertBook, updateBook } from './books';
import {
  createSeries,
  deleteSeries,
  restoreSeries,
  updateSeries,
  type SeriesInput,
} from './series';
import type { Actor } from './with-revision';

function seriesInput(name: string): SeriesInput {
  return { name, sortName: null, description: null, deletedAt: null, deletedBy: null };
}

function bookInput(title: string, isbn13: string | null = null) {
  return {
    title,
    subtitle: null,
    description: null,
    authors: [] as string[],
    seriesId: null,
    seriesPosition: null,
    releaseDate: null,
    releasePrecision: 'unknown' as const,
    pageCount: null,
    isbn13,
    coverUrl: null,
    deletedAt: null,
    deletedBy: null,
  };
}

describe.skipIf(!hasDatabase)('versioning, history and soft deletes', () => {
  let db: Db;
  let pool: Pool;
  let actor: Actor;
  let other: Actor;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
    actor = { id: await createTestUser(db, 'author') };
    other = { id: await createTestUser(db, 'editor') };
  });

  describe('creating', () => {
    it('starts at version 1 with a created revision and an activity row', async () => {
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);

      expect(created.version).toBe(1);

      const revisions = await db.select().from(bookRevisions);
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.changeKind).toBe('created');
      expect(revisions[0]?.version).toBe(1);

      // `book.added` is the one event that legitimately appears in both feeds: a
      // social act in activity, and version 1 in the change log.
      const events = await db.select().from(activity);
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe('book.added');
      expect(events[0]?.actorId).toBe(actor.id);
    });

    it('rejects a second live series with the same name, case-insensitively', async () => {
      await createSeries(db, seriesInput('The Expanse'), actor);

      await expect(createSeries(db, seriesInput('the expanse'), other)).rejects.toMatchObject({
        code: 'conflict',
      });
    });

    it('serialises concurrent creates of the same name into one success and one conflict', async () => {
      // The advisory lock is the whole point: without it both transactions pass
      // the duplicate check and both insert.
      const results = await Promise.allSettled([
        createSeries(db, seriesInput('Simultaneous'), actor),
        createSeries(db, seriesInput('Simultaneous'), other),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const reasons = results.flatMap((r) =>
        r.status === 'rejected' ? [r.reason as unknown] : [],
      );
      expect(fulfilled).toHaveLength(1);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toBeInstanceOf(AppError);

      const live = await activeSeries(db);
      expect(live).toHaveLength(1);
    });
  });

  describe('editing', () => {
    it('bumps the version and appends exactly one revision', async () => {
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);
      const edited = await updateBook(db, created.id, { pageCount: 577 }, other);

      expect(edited.version).toBe(2);
      expect(edited.updatedBy).toBe(other.id);

      const revisions = await db
        .select()
        .from(bookRevisions)
        .where(eq(bookRevisions.bookId, created.id));
      expect(revisions).toHaveLength(2);
      expect(revisions.map((r) => r.changeKind)).toEqual(['created', 'edited']);
    });

    it('writes no activity row for a catalog edit', async () => {
      // Edits are *changes*, not activity. Recording them in both places is
      // duplicate bookkeeping that can drift, so the changes feed reads the
      // revisions directly.
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);
      await updateBook(db, created.id, { pageCount: 577 }, actor);

      const events = await db.select().from(activity);
      expect(events.map((e) => e.kind)).toEqual(['book.added']);
    });

    it('rejects a stale expected version and leaves the record untouched', async () => {
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);
      await updateBook(db, created.id, { pageCount: 577 }, other, 1);

      await expect(updateBook(db, created.id, { pageCount: 999 }, actor, 1)).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'stale_version', currentVersion: 2 },
      });

      const [current] = await db.select().from(books).where(eq(books.id, created.id));
      expect(current?.pageCount).toBe(577);
      expect(current?.version).toBe(2);
    });

    it('accepts a matching expected version', async () => {
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);
      const edited = await updateBook(db, created.id, { pageCount: 577 }, actor, 1);
      expect(edited.version).toBe(2);
    });
  });

  describe('deleting and restoring', () => {
    it('treats a delete as a version, appending a revision and bumping', async () => {
      const created = await createSeries(db, seriesInput('The Expanse'), actor);
      const deleted = await deleteSeries(db, created.id, other);

      expect(deleted.version).toBe(2);
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.deletedBy).toBe(other.id);

      const revisions = await db.select().from(seriesRevisions);
      expect(revisions.map((r) => r.changeKind)).toEqual(['created', 'deleted']);
    });

    it('treats a restore as a further version', async () => {
      const created = await createSeries(db, seriesInput('The Expanse'), actor);
      await deleteSeries(db, created.id, actor);
      const restored = await restoreSeries(db, created.id, actor);

      expect(restored.version).toBe(3);
      expect(restored.deletedAt).toBeNull();

      const revisions = await db.select().from(seriesRevisions);
      expect(revisions.map((r) => r.changeKind)).toEqual(['created', 'deleted', 'restored']);
    });

    it('frees the name immediately, because a deletion guarantees version >= 2', async () => {
      const first = await createSeries(db, seriesInput('The Expanse'), actor);
      await deleteSeries(db, first.id, actor);

      const second = await createSeries(db, seriesInput('The Expanse'), other);
      expect(second.version).toBe(1);
      expect(second.id).not.toBe(first.id);
    });

    it('refuses to restore into a name that has been taken since', async () => {
      const first = await createSeries(db, seriesInput('The Expanse'), actor);
      await deleteSeries(db, first.id, actor);
      await createSeries(db, seriesInput('The Expanse'), other);

      await expect(restoreSeries(db, first.id, actor)).rejects.toMatchObject({ code: 'conflict' });
    });

    it('survives delete, recreate and delete of the same name repeatedly', async () => {
      for (let round = 0; round < 3; round += 1) {
        const s = await createSeries(db, seriesInput('Recycled'), actor);
        await deleteSeries(db, s.id, actor);
      }
      expect(await activeSeries(db)).toHaveLength(0);
    });

    it('leaves a deleted series attached to its books, so a restore is lossless', async () => {
      const s = await createSeries(db, seriesInput('The Expanse'), actor);
      const b = await createBook(db, { ...bookInput('Leviathan Wakes'), seriesId: s.id }, actor);
      await deleteSeries(db, s.id, actor);

      const [row] = await db.select().from(books).where(eq(books.id, b.id));
      expect(row?.seriesId).toBe(s.id);
    });

    it('excludes deleted rows from the active builders', async () => {
      const live = await createBook(db, bookInput('Live'), actor);
      const gone = await createBook(db, bookInput('Gone'), actor);
      await deleteBook(db, gone.id, actor);

      const rows = await activeBooks(db);
      expect(rows.map((r) => r.id)).toEqual([live.id]);
    });

    it('restores a book and returns it to the active set', async () => {
      const b = await createBook(db, bookInput('Mistake'), actor);
      await deleteBook(db, b.id, actor);
      const restored = await restoreBook(db, b.id, other);

      expect(restored.version).toBe(3);
      expect(await activeBooks(db)).toHaveLength(1);
    });
  });

  describe('reverting', () => {
    it('writes a new forward version rather than rewriting history', async () => {
      const created = await createBook(db, bookInput('Leviathan Wakes'), actor);
      await updateBook(db, created.id, { title: 'Leviathan Awakes' }, other);
      const reverted = await revertBook(db, created.id, 1, actor, 'typo');

      expect(reverted.title).toBe('Leviathan Wakes');
      expect(reverted.version).toBe(3);

      const revisions = await db
        .select()
        .from(bookRevisions)
        .where(eq(bookRevisions.bookId, created.id));
      expect(revisions.map((r) => r.changeKind)).toEqual(['created', 'edited', 'reverted']);
      const [revertRow] = revisions.filter((r) => r.version === 3);
      expect(revertRow?.note).toBe('typo');
    });

    it('can revert a revert, because nothing is ever truncated', async () => {
      const created = await createBook(db, bookInput('Original'), actor);
      await updateBook(db, created.id, { title: 'Changed' }, actor);
      await revertBook(db, created.id, 1, actor);
      const again = await revertBook(db, created.id, 2, actor);

      expect(again.title).toBe('Changed');
      expect(again.version).toBe(4);
    });

    it('rejects a version that does not exist', async () => {
      const created = await createBook(db, bookInput('Original'), actor);
      await expect(revertBook(db, created.id, 7, actor)).rejects.toMatchObject({
        code: 'not_found',
      });
    });

    it('keeps history intact across a delete and restore', async () => {
      const created = await createBook(db, bookInput('Original'), actor);
      await updateBook(db, created.id, { title: 'Edited' }, actor);
      await deleteBook(db, created.id, actor);
      await restoreBook(db, created.id, actor);

      const revisions = await db
        .select()
        .from(bookRevisions)
        .where(eq(bookRevisions.bookId, created.id));
      expect(revisions.map((r) => r.changeKind)).toEqual([
        'created',
        'edited',
        'deleted',
        'restored',
      ]);
      expect(revisions.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    });
  });

  it('keeps the current row in step with the highest-numbered revision', async () => {
    const created = await createBook(db, bookInput('Tracked'), actor);
    await updateBook(db, created.id, { pageCount: 100 }, actor);
    await updateBook(db, created.id, { pageCount: 200 }, actor);
    await deleteBook(db, created.id, actor);

    const [current] = await db.select().from(books).where(eq(books.id, created.id));
    const [top] = await db
      .select()
      .from(bookRevisions)
      .where(and(eq(bookRevisions.bookId, created.id), eq(bookRevisions.version, 4)));

    expect(current?.version).toBe(4);
    expect(top).toBeDefined();
    expect((top?.snapshot as { pageCount: number }).pageCount).toBe(200);
  });

  it('reports a missing record as not found rather than a crash', async () => {
    await expect(
      updateSeries(db, '00000000-0000-0000-0000-000000000000', { name: 'Nope' }, actor),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
