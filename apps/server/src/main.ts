import express, { type NextFunction, type Request, type Response } from 'express';
import { createApiRouter } from '@books/api';
import { resolveWebDistDir, serveWebBundle } from './static';

// esbuild inlines this at build time (see scripts/build-server.mjs). Under
// `tsx watch` it is simply absent, which is what the fallback is for.
const version = process.env['APP_VERSION'] ?? '0.0.0-dev';
const port = Number(process.env['PORT'] ?? 4000);

const app = express();

// TLS terminates at the homelab reverse proxy, so `req.ip` and `Secure` cookies
// need the forwarded headers to be trusted.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json());

// Cookie parsing, helmet, logging, auth, CSRF, and rate limiting join this stack
// in Phase 3, ahead of the API router.
app.use('/api/v1', createApiRouter({ version }));

serveWebBundle(app, resolveWebDistDir());

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong.' } });
});

const server = app.listen(port, () => {
  console.log(`books api listening on http://localhost:${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
