import { z } from 'zod';

/**
 * Fields every process (server, bot) needs. Each entry point validates only
 * this plus its own extension — not one shared schema for everything —
 * because Docker Compose is where "does each service only get what it
 * actually needs" stops being theoretical: a bot container has no business
 * requiring `AUTH_JWT_SECRET`, and a server container has no business
 * requiring `DISCORD_BOT_TOKEN`. `packages/db/src/cli/migrate.ts` doesn't use
 * this module at all — it reads `DATABASE_URL` directly via
 * `packages/db/src/client.ts`'s `databaseUrl()`.
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Read natively by Node for every `Date`/`Intl` operation — nothing here
   *  consumes this value directly. Matters because the release job
   *  (`apps/server/src/jobs/releases.ts`) runs "just after local midnight";
   *  without this set explicitly a container inherits UTC, not the
   *  deployment's actual local time. */
  TZ: z.string().default('UTC'),
  /** `packages/api/src/middleware/logger.ts` reads this directly from
   *  `process.env`, not from a loader's return value — its `pino` singleton
   *  is constructed at module-load time, before any call site's loader
   *  necessarily runs. It's validated here anyway so a bad value is
   *  documented and caught at boot, even though pino's own construction
   *  already throws on an invalid level regardless. */
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
});

const serverSchema = baseSchema.extend({
  /** The origin the browser actually loads the app from — `http://localhost:4200`
   *  in dev, since the Angular dev-server proxy keeps the API same-origin from the
   *  browser's point of view. Used to build the Discord redirect target and to
   *  validate `Origin`/`Referer` on mutating requests. */
  PUBLIC_BASE_URL: z.string().url(),

  /** No default, deliberately — a weak or committed secret is the entire access
   *  token scheme's failure mode. 32 characters is the practical floor for an
   *  HS256 key. */
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters.'),
  AUTH_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** `Secure` cookies work over `http://localhost` too — modern browsers treat it
   *  as a secure context — so this only needs to be `false` for a non-TLS
   *  deployment on a real host, never for local dev. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  COOKIE_DOMAIN: z.string().optional(),

  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  /** Required, not optional — this is the membership gate, not a filter. */
  DISCORD_ALLOWED_GUILD_ID: z.string().min(1),
});

const botSchema = baseSchema.extend({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  /** Guild-scoped command registration (instant) when set; global (up to 1h
   *  propagation) when absent. Optional, unlike `DISCORD_ALLOWED_GUILD_ID` —
   *  this is a deploy-target choice, not an access gate. */
  DISCORD_GUILD_ID: z.string().optional(),
  /** Where the bot sends a member to sign in — distinct from `PUBLIC_BASE_URL`,
   *  which is specifically the browser's own origin for the OAuth redirect and
   *  the CSRF `Origin` check. The bot has no browser-facing concern of its
   *  own, only "where do I send someone." */
  WEB_BASE_URL: z.string().url(),
  /** The channel `post-changelog.ts` posts a release announcement to. Only
   *  that one-shot script reads this — the gateway client (`main.ts`) never
   *  does — but it lives in `botSchema` rather than a schema of its own so a
   *  missing value fails fast the same way every other bot credential does. */
  DISCORD_CHANGELOG_CHANNEL_ID: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type BotEnv = z.infer<typeof botSchema>;

function parseOrThrow<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}

/**
 * Parses and validates `process.env` once, at boot. A missing or malformed
 * value fails the process immediately with every problem listed at once,
 * rather than surfacing as a confusing runtime error the first time the code
 * path is hit.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return parseOrThrow(serverSchema, source);
}

export function loadBotEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  return parseOrThrow(botSchema, source);
}
