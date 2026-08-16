import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { loadServerEnv } from '@books/config';
import { createDb } from '@books/db';
import { createApiRouter, createDiscordClient, type ApiDeps } from '@books/api';
import { scheduleReleaseAnnouncementJob } from './jobs/releases';
import { resolveWebDistDir, serveWebBundle } from './static';

// esbuild inlines this at build time (see scripts/build-server.mjs). Under
// `tsx watch` it is simply absent, hence the fallback.
const version = process.env['APP_VERSION'] ?? '0.0.0-dev';

const env = loadServerEnv();
const { db, pool } = createDb(env.DATABASE_URL);

const deps: ApiDeps = {
  version,
  db,
  discord: createDiscordClient(),
  auth: {
    jwtSecret: env.AUTH_JWT_SECRET,
    accessTtlSeconds: env.AUTH_ACCESS_TTL_MIN * 60,
    refreshTtlSeconds: env.AUTH_REFRESH_TTL_DAYS * 24 * 60 * 60,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    discordRedirectUri: env.DISCORD_REDIRECT_URI,
    discordAllowedGuildId: env.DISCORD_ALLOWED_GUILD_ID,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    cookieSecure: env.COOKIE_SECURE,
    ...(env.COOKIE_DOMAIN !== undefined && { cookieDomain: env.COOKIE_DOMAIN }),
  },
};

const app = express();

// TLS terminates at the homelab reverse proxy, so `req.ip` and `Secure` cookies
// need the forwarded headers to be trusted.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(cookieParser());
app.use(express.json());
app.use(helmet());

app.use('/api/v1', createApiRouter(deps));

serveWebBundle(app, resolveWebDistDir());

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong.' } });
});

const releaseJob = scheduleReleaseAnnouncementJob(db);

const server = app.listen(env.PORT, () => {
  console.log(`books api listening on http://localhost:${String(env.PORT)}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void releaseJob.stop();
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
