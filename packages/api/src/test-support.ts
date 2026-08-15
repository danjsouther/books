import type { Db } from '@books/db';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { createApiRouter } from './router';
import type { ApiDeps } from './types';
import type {
  DiscordClient,
  DiscordGuild,
  DiscordTokens,
  DiscordUser,
  ExchangeCodeParams,
} from './auth/discord-client';

export const TEST_ALLOWED_GUILD_ID = '900000000000000001';

/** A `DiscordClient` double: no network, fully scriptable, and able to simulate
 *  every failure mode a real Discord outage or a PKCE mismatch would produce. */
export class FakeDiscordClient implements DiscordClient {
  exchangeCodeError: Error | null = null;
  user: DiscordUser = {
    id: '100000000000000099',
    username: 'testuser',
    global_name: 'Test User',
    avatar: null,
  };
  guilds: DiscordGuild[] = [{ id: TEST_ALLOWED_GUILD_ID, name: 'Test Guild' }];
  exchangedWith: ExchangeCodeParams[] = [];

  buildAuthorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    return url.toString();
  }

  exchangeCode(params: ExchangeCodeParams): Promise<DiscordTokens> {
    this.exchangedWith.push(params);
    if (this.exchangeCodeError) return Promise.reject(this.exchangeCodeError);
    return Promise.resolve({
      access_token: `discord-access-${params.code}`,
      refresh_token: `discord-refresh-${params.code}`,
      expires_in: 604800,
    });
  }

  fetchUser(): Promise<DiscordUser> {
    return Promise.resolve(this.user);
  }

  fetchGuilds(): Promise<DiscordGuild[]> {
    return Promise.resolve(this.guilds);
  }
}

export function testAuthConfig(overrides: Partial<ApiDeps['auth']> = {}): ApiDeps['auth'] {
  return {
    jwtSecret: 'test-only-secret-that-is-at-least-32-characters-long',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 60 * 60 * 24 * 30,
    discordClientId: 'test-client-id',
    discordClientSecret: 'test-client-secret',
    discordRedirectUri: 'http://localhost:4200/api/v1/auth/discord/callback',
    discordAllowedGuildId: TEST_ALLOWED_GUILD_ID,
    publicBaseUrl: 'http://localhost:4200',
    cookieSecure: false,
    ...overrides,
  };
}

export interface TestApp {
  readonly app: Express;
  readonly discord: FakeDiscordClient;
  readonly auth: ApiDeps['auth'];
}

/** Wraps `createApiRouter` exactly as `apps/server/src/main.ts` does, so a
 *  `supertest` request exercises the real middleware stack — cookies, CSRF,
 *  rate limiting — with a real database and a scripted Discord double standing
 *  in for the network. */
export function buildTestApp(db: Db, overrides: Partial<ApiDeps['auth']> = {}): TestApp {
  const discord = new FakeDiscordClient();
  const auth = testAuthConfig(overrides);

  const app = express();
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1', createApiRouter({ version: 'test', db, auth, discord }));

  return { app, discord, auth };
}
