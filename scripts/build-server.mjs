import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * `packages: 'external'` leaves node_modules alone — the container installs them
 * with `npm ci --omit=dev`, and bundling them would only make the image harder to
 * audit. `tsconfig` points at tsconfig.node.json so the `@books/*` path aliases
 * resolve to source; there is no build step between internal packages.
 */
await build({
  entryPoints: ['apps/server/src/main.ts'],
  outfile: 'dist/server/main.js',
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

// The root package.json cannot declare `"type": "module"` — eslint.config.js is
// CommonJS — so the ESM bundle carries its own marker. Without it Node reparses
// the file as CommonJS, fails, and warns on every boot.
mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/server/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
