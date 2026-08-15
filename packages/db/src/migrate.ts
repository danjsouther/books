import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';
import { isMain } from './is-main';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Deliberately a standalone entry point rather than something the server runs at
 * boot. Two processes racing `migrate()` on startup is a real failure mode, and
 * coupling schema changes to application start makes rollback impossible — in
 * Compose this runs as a one-shot service the app waits on.
 */
export async function runMigrations(): Promise<void> {
  const { db, pool } = createDb();
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// Not top-level await: the root package.json has no `"type": "module"` (ESLint's
// config is CommonJS), so tsx transforms these files as CJS.
if (isMain(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied.');
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
