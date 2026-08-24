import { backfillSlugs } from '../backfill-slugs';

/** The actual `npm run db:backfill-slugs` entry point — see `cli/migrate.ts`
 *  for why this lives outside anything the package barrel re-exports. */
backfillSlugs()
  .then(() => {
    console.log('Slugs backfilled.');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
