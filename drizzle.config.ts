import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are generated into `packages/db/src/migrations` and the SQL is
 * committed. `drizzle-kit push` is for local scratch only — it never runs against
 * an environment anyone else uses, because it skips the reviewable artifact.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema/index.ts',
  out: './packages/db/src/migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://books:books@localhost:5432/books',
  },
  strict: true,
  verbose: true,
});
