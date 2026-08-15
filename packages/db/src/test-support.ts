import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { createDb, type Db } from './client';
import { runMigrations } from './migrate';
import { users } from './schema/users';

/**
 * These specs run against a real Postgres, not a fake, because what they are
 * testing *is* Postgres behaviour — check constraints, advisory locks, and
 * transaction boundaries have no meaningful in-memory equivalent.
 *
 * They skip themselves when `DATABASE_URL` is absent, so a contributor with no
 * database can still run the rest of the suite. CI always sets it, so nothing is
 * quietly skipped where it matters.
 */
export const hasDatabase = Boolean(process.env['DATABASE_URL']);

export interface TestDb {
  db: Db;
  pool: Pool;
}

export async function connectForTests(): Promise<TestDb> {
  await runMigrations();
  return createDb();
}

/** Transactions are not usable for isolation here: the code under test opens its
 *  own, and a nested one would not behave the same way. Truncation it is. */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE activity, book_revisions, series_revisions, book_user_status,
                   refresh_tokens, api_tokens, oauth_states, books, series, users
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Names the constraint Postgres actually rejected on, or `undefined` if the call
 * succeeded. Drizzle wraps the driver error in a "Failed query: ..." message, so
 * matching on message text would pass for the wrong reason — the constraint name
 * lives on the cause.
 */
export async function violatedConstraint(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint;
  }
}

export async function createTestUser(db: Db, username = 'tester'): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ discordId: `test-${username}-${String(Date.now())}`, username })
    .returning({ id: users.id });
  if (row === undefined) throw new Error('Could not create a test user.');
  return row.id;
}
