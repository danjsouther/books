import type { Db } from '@books/db';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import request from 'supertest';
import { createApiRouter } from './router';
import type { ApiDeps } from './types';
import type {
  DiscordClient,
  DiscordGuild,
  DiscordGuildMember,
  DiscordTokens,
  DiscordUser,
  ExchangeCodeParams,
} from './auth/discord-client';
import type { ActivityAnnouncer, AnnouncedBook } from './discord/announcer';

export const TEST_ALLOWED_GUILD_ID = '900000000000000001';
export const TEST_REQUIRED_ROLE_ID = '900000000000000002';

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
  memberRoles: string[] = [TEST_REQUIRED_ROLE_ID];
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

  fetchGuildMember(): Promise<DiscordGuildMember> {
    return Promise.resolve({ roles: this.memberRoles });
  }
}

/** An `ActivityAnnouncer` double: no network, records every call so a spec can
 *  assert on it directly instead of intercepting `fetch`. */
export class FakeActivityAnnouncer implements ActivityAnnouncer {
  bookAddedCalls: AnnouncedBook[] = [];
  bookReleasedCalls: AnnouncedBook[] = [];

  announceBookAdded(book: AnnouncedBook): Promise<void> {
    this.bookAddedCalls.push(book);
    return Promise.resolve();
  }

  announceBookReleased(book: AnnouncedBook): Promise<void> {
    this.bookReleasedCalls.push(book);
    return Promise.resolve();
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
    discordRequiredRoleId: TEST_REQUIRED_ROLE_ID,
    publicBaseUrl: 'http://localhost:4200',
    cookieSecure: false,
    ...overrides,
  };
}

export interface TestApp {
  readonly app: Express;
  readonly discord: FakeDiscordClient;
  readonly announcer: FakeActivityAnnouncer;
  readonly auth: ApiDeps['auth'];
}

/** Wraps `createApiRouter` exactly as `apps/server/src/main.ts` does, so a
 *  `supertest` request exercises the real middleware stack — cookies, CSRF,
 *  rate limiting — with a real database and scripted Discord doubles standing
 *  in for the network. */
export function buildTestApp(db: Db, overrides: Partial<ApiDeps['auth']> = {}): TestApp {
  const discord = new FakeDiscordClient();
  const announcer = new FakeActivityAnnouncer();
  const auth = testAuthConfig(overrides);

  const app = express();
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1', createApiRouter({ version: 'test', db, auth, discord, announcer }));

  return { app, discord, announcer, auth };
}

/** Logs a fresh member in through the real Discord-callback path (desktop, so the
 *  tokens come back as JSON rather than cookies) and returns a bearer header and
 *  that member's id — the shared login step every non-auth route spec needs before
 *  it can call anything past `requireAuth`. */
export async function loginTestUser(
  testApp: TestApp,
): Promise<{ userId: string; authHeader: { Authorization: string } }> {
  const start = await request(testApp.app).get('/api/v1/auth/discord/start?client=desktop');
  const location = start.headers['location'];
  if (typeof location !== 'string') throw new Error('No redirect from /discord/start.');
  const state = new URL(location).searchParams.get('state');
  if (state === null) throw new Error('No state in authorize URL.');

  const login = await request(testApp.app).get(
    `/api/v1/auth/discord/callback?code=test-code&state=${state}`,
  );
  const body = login.body as { accessToken?: unknown };
  if (typeof body.accessToken !== 'string')
    throw new Error('Login did not return an access token.');

  const me = await request(testApp.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${body.accessToken}`);
  const meBody = me.body as { id?: unknown };
  if (typeof meBody.id !== 'string') throw new Error('/auth/me did not return an id.');

  return { userId: meBody.id, authHeader: { Authorization: `Bearer ${body.accessToken}` } };
}

/** `supertest`'s `res.body` is typed `any` — every route spec needs to narrow it
 *  before touching a property, or `@typescript-eslint/no-unsafe-member-access`
 *  rejects it. One explicit cast per response beats scattering `as` everywhere the
 *  body is touched. */
export function bodyAs<T>(res: { body: unknown }): T {
  return res.body as T;
}
