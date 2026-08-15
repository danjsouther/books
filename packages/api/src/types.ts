import type { Db } from '@books/db';
import type { DiscordClient } from './auth/discord-client';

export interface AuthConfig {
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  discordClientId: string;
  discordClientSecret: string;
  discordRedirectUri: string;
  discordAllowedGuildId: string;
  /** The origin the browser loads the app from — used to validate `Origin` /
   *  `Referer` on mutations and as the base for post-login redirects. */
  publicBaseUrl: string;
  cookieSecure: boolean;
  cookieDomain?: string;
}

export interface ApiDeps {
  /** Reported by `/health`, so a deployment can be identified without shelling in. */
  readonly version: string;
  readonly db: Db;
  readonly auth: AuthConfig;
  readonly discord: DiscordClient;
}

/** What the access token actually authenticates: an identity and which kind of
 *  client is holding it. Nothing else is worth caching per request — anything
 *  more (roles, guild membership) is re-checked from the database where it can
 *  change without waiting for a token to expire. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly client: 'web' | 'desktop';
}

// `declare global { namespace Express { ... } }` is the documented way to add
// properties to Express's `Request` — there is no ES module equivalent for
// augmenting an ambient namespace, so the usual "prefer modules" rule does not
// apply here.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `createAuthContext`, before any route runs. `null` means no valid
       *  credential was presented — never left `undefined`, so a route can never
       *  mistake "not yet checked" for "checked and anonymous". */
      user: AuthenticatedUser | null;
      /** Which credential authenticated the request, if any. Drives the CSRF
       *  branch: bearer requests have no ambient credential to forge, so the
       *  double-submit check only applies when this is `'cookie'`. */
      authMethod: 'bearer' | 'cookie' | null;
    }
  }
}

/** `req.id` comes from `pino-http`'s own augmentation of `IncomingMessage`
 *  (`id?: string | number | object`), set by `requestId` before anything else
 *  runs. This narrows it back to what it always actually is. */
export function requestIdOf(req: { id?: string | number | object }): string {
  if (typeof req.id === 'string') return req.id;
  if (typeof req.id === 'number') return String(req.id);
  return req.id === undefined ? '' : JSON.stringify(req.id);
}
