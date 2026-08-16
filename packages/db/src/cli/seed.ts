import { createDb } from '../client';
import { seed } from '../seed';

/** The actual `npm run db:seed` entry point — see `cli/migrate.ts` for why this
 *  lives outside anything the package barrel re-exports. */
const { db, pool } = createDb();
seed(db)
  .then(() => {
    console.log('Seeded.');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
