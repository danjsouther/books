import type { ShelfUpdate } from '@books/domain';
import { AppError } from '@books/domain';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { activity } from '../schema/activity';
import { bookUserStatus } from '../schema/shelf';

export type BookUserStatus = typeof bookUserStatus.$inferSelect;

/**
 * Upserts one member's status/rating for one book, and — in the same transaction —
 * writes the `status.changed`/`rating.changed` activity rows a real change produces.
 * This table has no revision history of its own; the activity feed is where that
 * trail lives, which is exactly why the write has to happen alongside the upsert
 * rather than after it.
 *
 * Marking a book `completed` forces `percentRead` to 100, overriding whatever the
 * patch itself said — finishing a book means 100% by definition. No other status
 * transition touches `percentRead`; it is otherwise an independent field the
 * member controls directly.
 */
export async function upsertShelfStatus(
  db: Db,
  bookId: string,
  userId: string,
  patch: ShelfUpdate,
): Promise<BookUserStatus> {
  const resolvedPatch = patch.status === 'completed' ? { ...patch, percentRead: 100 } : patch;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(bookUserStatus)
      .where(and(eq(bookUserStatus.bookId, bookId), eq(bookUserStatus.userId, userId)))
      .limit(1);

    const [row] = await tx
      .insert(bookUserStatus)
      .values({ bookId, userId, ...resolvedPatch, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [bookUserStatus.bookId, bookUserStatus.userId],
        set: { ...resolvedPatch, updatedAt: new Date() },
      })
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Upsert returned no row.');

    if ((before?.status ?? null) !== row.status) {
      await tx.insert(activity).values({
        kind: 'status.changed',
        actorId: userId,
        bookId,
        payload: { from: before?.status ?? null, to: row.status },
      });
    }
    if ((before?.rating ?? null) !== row.rating) {
      await tx.insert(activity).values({
        kind: 'rating.changed',
        actorId: userId,
        bookId,
        payload: { from: before?.rating ?? null, to: row.rating },
      });
    }
    return row;
  });
}

export async function getShelfStatus(
  db: Db,
  bookId: string,
  userId: string,
): Promise<BookUserStatus | undefined> {
  const [row] = await db
    .select()
    .from(bookUserStatus)
    .where(and(eq(bookUserStatus.bookId, bookId), eq(bookUserStatus.userId, userId)))
    .limit(1);
  return row;
}

/** Hard delete — this table is the one exception to soft deletes, see the note on
 *  its schema. Writes a `shelf.removed` activity row only when a row actually went
 *  away, not on a delete of something that was never there. */
export async function removeShelfEntry(db: Db, bookId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(bookUserStatus)
      .where(and(eq(bookUserStatus.bookId, bookId), eq(bookUserStatus.userId, userId)))
      .returning({ bookId: bookUserStatus.bookId });
    if (deleted.length > 0) {
      await tx
        .insert(activity)
        .values({ kind: 'shelf.removed', actorId: userId, bookId, payload: {} });
    }
  });
}
