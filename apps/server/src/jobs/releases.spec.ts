import { schema, type Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runReleaseAnnouncementJob } from './releases';

const { books, activity } = schema;

// `createdAt` defaults to the real clock on insert, so every date used here is
// relative to the actual moment the spec runs — not a fixed fictional date —
// so the backdating guard (`createdAt <= releaseDate + 1 day`) behaves the
// same way it would for a book added around when it was actually announced.
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = isoDaysFromNow(0);

async function insertBook(
  db: Db,
  overrides: Partial<{
    title: string;
    releaseDate: string | null;
    releasePrecision: 'day' | 'month' | 'year' | 'unknown';
    createdAt: Date;
  }>,
): Promise<string> {
  const [row] = await db
    .insert(books)
    .values({
      title: overrides.title ?? 'A Book',
      releaseDate: overrides.releaseDate ?? null,
      releasePrecision: overrides.releasePrecision ?? 'unknown',
      ...(overrides.createdAt !== undefined && { createdAt: overrides.createdAt }),
    })
    .returning({ id: books.id });
  if (row === undefined) throw new Error('Insert returned no row.');
  return row.id;
}

describe.skipIf(!hasDatabase)('runReleaseAnnouncementJob', () => {
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

  it('announces a day-precision book whose release date has arrived', async () => {
    const id = await insertBook(db, {
      title: 'Leviathan Wakes',
      releaseDate: isoDaysFromNow(-1),
      releasePrecision: 'day',
    });

    const count = await runReleaseAnnouncementJob(db, TODAY);
    expect(count).toBe(1);

    const [row] = await db.select().from(books).where(eq(books.id, id));
    expect(row?.releasedAnnouncedAt).not.toBeNull();

    const events = await db.select().from(activity).where(eq(activity.bookId, id));
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('book.released');
    expect(events[0]?.payload).toEqual({ releaseDate: isoDaysFromNow(-1) });
  });

  it('does not announce the same book twice across separate runs', async () => {
    await insertBook(db, {
      title: 'Leviathan Wakes',
      releaseDate: isoDaysFromNow(-1),
      releasePrecision: 'day',
    });

    await runReleaseAnnouncementJob(db, TODAY);
    const second = await runReleaseAnnouncementJob(db, isoDaysFromNow(1));

    expect(second).toBe(0);
    const events = await db.select().from(activity);
    expect(events).toHaveLength(1);
  });

  it('skips a book backdated well after its release date', async () => {
    await insertBook(db, {
      title: 'An Old Book',
      releaseDate: '2015-06-01',
      releasePrecision: 'day',
      // Real insert time, far later than the release date it's backdated to.
      createdAt: new Date(),
    });

    const count = await runReleaseAnnouncementJob(db, TODAY);
    expect(count).toBe(0);
    const events = await db.select().from(activity);
    expect(events).toHaveLength(0);
  });

  it('never announces month/year/unknown-precision books', async () => {
    await insertBook(db, {
      title: 'Monthly',
      releaseDate: isoDaysFromNow(-1),
      releasePrecision: 'month',
    });
    await insertBook(db, {
      title: 'Yearly',
      releaseDate: isoDaysFromNow(-1),
      releasePrecision: 'year',
    });
    await insertBook(db, { title: 'Unknown', releaseDate: null, releasePrecision: 'unknown' });

    const count = await runReleaseAnnouncementJob(db, TODAY);
    expect(count).toBe(0);
    const events = await db.select().from(activity);
    expect(events).toHaveLength(0);
  });

  it('does not announce a book whose release date is still in the future', async () => {
    await insertBook(db, {
      title: 'Future Book',
      releaseDate: isoDaysFromNow(1),
      releasePrecision: 'day',
    });

    const count = await runReleaseAnnouncementJob(db, TODAY);
    expect(count).toBe(0);
  });
});
