import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Deliberately a standalone entry point (see `cli/migrate.ts`) rather than
 * something the server runs at boot. Two processes racing `migrate()` on startup
 * is a real failure mode, and coupling schema changes to application start makes
 * rollback impossible — in Compose this runs as a one-shot service the app waits
 * on.
 *
 * This file exports only the function — no top-level trigger. `apps/server`
 * bundles `@books/db` as a single file, and a CLI-style `if (isMain(...))` guard
 * here would fire the moment *that* bundle's entry point matched, since bundling
 * collapses every source module's `import.meta.url` onto the same file. That is
 * exactly how a server boot once triggered a silent re-migrate.
 */
export async function runMigrations(): Promise<void> {
  const { db, pool } = createDb();
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
