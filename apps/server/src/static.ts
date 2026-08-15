import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

/** Angular names hashed output `main-A1B2C3D4.js`. Anything copied verbatim from
 *  `public/` (favicon.ico and friends) keeps its plain name and is not immutable. */
const HASHED_FILENAME = /-[A-Z0-9]{8,}\.[a-z0-9]+$/i;

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const ONE_HOUR_SECONDS = 60 * 60;

/**
 * Serves the built Angular bundle and falls back to `index.html` so a deep link
 * survives a hard refresh.
 *
 * `index.html` is served `no-store` while hashed assets get a year. Getting that
 * backwards is the classic SPA deploy failure: a cached `index.html` keeps
 * pointing at bundle hashes that the new deploy has already purged, and every
 * returning client gets a blank page until they clear their cache.
 */
export function serveWebBundle(app: Express, webDistDir: string): void {
  const indexHtml = join(webDistDir, 'index.html');

  app.use(
    express.static(webDistDir, {
      index: false,
      redirect: false,
      setHeaders: (res, filePath) => {
        res.setHeader(
          'Cache-Control',
          HASHED_FILENAME.test(filePath)
            ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
            : `public, max-age=${ONE_HOUR_SECONDS}`,
        );
      },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Unmatched API paths must 404 as API paths, not quietly return the SPA — a
    // client that gets HTML back from a fetch it expected JSON from fails in a
    // far more confusing place than the request itself.
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (!existsSync(indexHtml)) {
      next(new Error(`No web bundle at ${webDistDir} — run \`npm run build:web\` first.`));
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexHtml);
  });
}

/** Where the browser bundle lives, resolved against the working directory so the
 *  same value works from the repo root in dev and from `/app` in the container. */
export function resolveWebDistDir(): string {
  return resolve(process.cwd(), process.env['WEB_DIST_DIR'] ?? 'dist/web');
}
