import { runMigrations } from '../migrate';

/**
 * The actual `npm run db:migrate` entry point. Kept out of `migrate.ts` itself —
 * and out of anything `@books/db`'s barrel re-exports — because `apps/server`
 * bundles this package into one file, and a top-level trigger living in an
 * exported module would fire the moment the *bundle's* entry point matched,
 * regardless of which source file it started life in.
 */
runMigrations()
  .then(() => {
    console.log('Migrations applied.');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
