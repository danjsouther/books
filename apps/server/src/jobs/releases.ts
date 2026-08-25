import type { ActivityAnnouncer } from '@books/api';
import { schema, type Db } from '@books/db';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import cron, { type ScheduledTask } from 'node-cron';

const { books, activity } = schema;

export interface AnnouncedRelease {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly releaseDate: string | null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Reads the real local clock once — isolated the same way the calendar
 *  page's `todayIsoLocal` is, so the job function itself stays pure and
 *  trivially testable with a fixed date. */
function todayIsoLocal(): string {
  const d = new Date();
  return `${String(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Announces every day-precision book whose release date has arrived, exactly
 * once, ever — idempotent two ways. `UPDATE ... RETURNING` both selects and
 * claims a book atomically (the `released_announced_at IS NULL` guard and the
 * write happen in one statement), so a second call the same day finds
 * nothing left to claim; the activity insert is additionally guarded by the
 * partial unique index on `(kind, bookId) WHERE kind = 'book.released'`
 * (`packages/db/src/schema/activity.ts`), in case two overlapping calls ever
 * raced past the first guard.
 *
 * `createdAt::date <= releaseDate + 1 day` skips backdated additions — a book
 * added today with a release date from 2015 must not announce as new. This
 * compares calendar dates, not precise instants: comparing `createdAt`
 * (a timestamp, with a real time-of-day) directly against `releaseDate + 1
 * day` (which lands on a midnight) would reject a perfectly normal book
 * released yesterday and added this afternoon, since "this afternoon" is
 * later than "midnight, one day after release." Casting both sides to a date
 * first is what gives a real one-day grace window regardless of time-of-day.
 */
export async function runReleaseAnnouncementJob(
  db: Db,
  todayIso: string,
): Promise<AnnouncedRelease[]> {
  return db.transaction(async (tx) => {
    const announced = await tx
      .update(books)
      .set({ releasedAnnouncedAt: sql`now()` })
      .where(
        and(
          isNull(books.deletedAt),
          eq(books.releasePrecision, 'day'),
          lte(books.releaseDate, todayIso),
          isNull(books.releasedAnnouncedAt),
          sql`${books.createdAt}::date <= (${books.releaseDate}::date + 1)`,
        ),
      )
      .returning({
        id: books.id,
        title: books.title,
        slug: books.slug,
        releaseDate: books.releaseDate,
      });

    if (announced.length === 0) return [];

    await tx
      .insert(activity)
      .values(
        announced.map((b) => ({
          kind: 'book.released' as const,
          bookId: b.id,
          payload: { releaseDate: b.releaseDate },
        })),
      )
      .onConflictDoNothing();

    return announced;
  });
}

/** Runs once immediately — catching up on any release missed while the
 *  process was down — then daily just after local midnight. `TZ` is a
 *  deployment concern (Phase 10); this schedules against the process's local
 *  time, whatever that is set to. */
export function scheduleReleaseAnnouncementJob(
  db: Db,
  announcer: ActivityAnnouncer,
): ScheduledTask {
  const runNow = (): void => {
    runReleaseAnnouncementJob(db, todayIsoLocal())
      .then((announced) => {
        if (announced.length > 0) {
          console.log(`release job: announced ${String(announced.length)} book(s)`);
        }
        for (const book of announced) {
          void announcer.announceBookReleased({ title: book.title, slug: book.slug });
        }
      })
      .catch((err: unknown) => {
        console.error('release job failed', err);
      });
  };

  runNow();
  return cron.schedule('5 0 * * *', runNow);
}
