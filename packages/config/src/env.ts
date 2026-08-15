import { z } from 'zod';

/**
 * The subset of the eventual env surface that auth needs to fail fast at boot.
 * Phase 10 adds the rest (`TZ`, `LOG_LEVEL`, the bot's variables, …) alongside
 * Docker Compose — this schema only grows then, it does not get restructured.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** The origin the browser actually loads the app from — `http://localhost:4200`
   *  in dev, since the Angular dev-server proxy keeps the API same-origin from the
   *  browser's point of view. Used to build the Discord redirect target and to
   *  validate `Origin`/`Referer` on mutating requests. */
  PUBLIC_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

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

export type Env = z.infer<typeof schema>;

/**
 * Parses and validates `process.env` once, at boot. A missing or malformed value
 * fails the process immediately with every problem listed at once, rather than
 * surfacing as a confusing 500 the first time the code path is hit.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}
