import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * Mirrors `build-server.mjs` exactly — see its comment for why
 * `packages: 'external'` and the ESM marker file are both here.
 */
await build({
  entryPoints: ['apps/bot/src/main.ts'],
  outfile: 'dist/bot/main.js',
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

// Bundled alongside `main.js` so the deployed image can run it as a one-shot
// `docker compose run --rm bot node dist/bot/deploy-commands.js` — see that
// file's own doc comment for why it must stay manual, never part of `CMD`.
await build({
  entryPoints: ['apps/bot/src/deploy-commands.ts'],
  outfile: 'dist/bot/deploy-commands.js',
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

mkdirSync('dist/bot', { recursive: true });
writeFileSync('dist/bot/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
