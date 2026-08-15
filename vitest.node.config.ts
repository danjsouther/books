import { defineConfig } from 'vitest/config';

/**
 * Node-side tests: the shared packages and the API. Separate from the Angular
 * unit tests, which the Angular CLI's own builder runs in jsdom — one config
 * cannot sensibly serve both.
 *
 * Integration specs need a real Postgres (`DATABASE_URL`), because the behaviour
 * under test *is* Postgres behaviour: check constraints, advisory locks, and
 * transaction boundaries. They skip themselves when it is absent so the unit
 * tests still run on a machine with no database.
 */
export default defineConfig({
  // Resolves the `@books/*` aliases from tsconfig.node.json.
  resolve: { tsconfigPaths: true },
  test: {
    name: 'node',
    environment: 'node',
    include: ['packages/**/*.spec.ts', 'apps/server/**/*.spec.ts'],
    // Integration specs share one database and truncate between tests, so they
    // must not run concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
