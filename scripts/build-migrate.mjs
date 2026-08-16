import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * Mirrors `build-server.mjs`/`build-bot.mjs` exactly. This one exists because
 * `npm run db:migrate` runs `packages/db/src/cli/migrate.ts` via `tsx`, a
 * devDependency absent from the runtime image's `npm ci --omit=dev` install —
 * the one-shot `migrate` Compose service needs a standalone bundle instead,
 * the same way the server and bot processes already have one.
 */
await build({
  entryPoints: ['packages/db/src/cli/migrate.ts'],
  outfile: 'dist/migrate/main.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  tsconfig: 'tsconfig.node.json',
  define: { 'process.env.APP_VERSION': JSON.stringify(version) },
  logLevel: 'info',
});

mkdirSync('dist/migrate', { recursive: true });
writeFileSync('dist/migrate/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

// `runMigrations()` resolves `migrationsFolder` relative to its own
// `import.meta.url` — after bundling that's `dist/migrate/main.js`, so the
// SQL files must actually live at `dist/migrate/migrations`, not just at
// their original `packages/db/src/migrations` source location.
cpSync('packages/db/src/migrations', 'dist/migrate/migrations', { recursive: true });
