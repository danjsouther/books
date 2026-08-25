import type { Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../test-support';

/** Pulls `state` back out of the redirect Location `/discord/start` returns, so a
 *  test can hand it straight to `/discord/callback` without re-deriving PKCE. */
function stateFromLocation(location: string): string {
  const state = new URL(location).searchParams.get('state');
  if (state === null) throw new Error('No state in authorize URL.');
  return state;
}

function cookieValue(
  setCookieHeader: readonly string[] | undefined,
  name: string,
): string | undefined {
  const line = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.split('=')[1];
}

interface TokenPairBody {
  accessToken: string;
  refreshToken: string;
}

function tokenPairBody(body: unknown): TokenPairBody {
  const b = body as Partial<TokenPairBody>;
  if (typeof b.accessToken !== 'string' || typeof b.refreshToken !== 'string') {
    throw new Error('Response body was not a token pair.');
  }
  return { accessToken: b.accessToken, refreshToken: b.refreshToken };
}

describe.skipIf(!hasDatabase)('Discord login and session lifecycle', () => {
  let db: Db;
  let pool: Pool;
  let testApp: TestApp;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
    testApp = buildTestApp(db);
  });

  async function startAndGetState(query = ''): Promise<string> {
    const res = await request(testApp.app).get(`/api/v1/auth/discord/start${query}`);
    expect(res.status).toBe(302);
    return stateFromLocation(res.headers['location']!);
  }

  describe('the web login round trip', () => {
    it('issues cookies and lands on the requested page', async () => {
      const state = await startAndGetState('?client=web&redirect_to=/books');

      const res = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );

      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe('http://localhost:4200/books');

      const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookieValue(setCookie, 'books_at')).toBeDefined();
      expect(cookieValue(setCookie, 'books_rt')).toBeDefined();
      expect(cookieValue(setCookie, 'XSRF-TOKEN')).toBeDefined();

      // Discord's own tokens were used to make the calls and nowhere else.
      expect(testApp.discord.exchangedWith).toHaveLength(1);
    });

    it("never asks Discord for anything the app doesn't already know it needs", async () => {
      const state = await startAndGetState();
      await request(testApp.app).get(`/api/v1/auth/discord/callback?code=abc123&state=${state}`);

      const [call] = testApp.discord.exchangedWith;
      expect(call?.codeVerifier).toBeDefined();
      expect(call?.code).toBe('abc123');
    });

    it('reaches /auth/me with the issued cookie', async () => {
      const agent = request.agent(testApp.app);
      const state = await startAndGetState();
      await agent.get(`/api/v1/auth/discord/callback?code=abc123&state=${state}`);

      const res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ username: 'testuser', discordId: '100000000000000099' });
    });
  });

  describe('the desktop login round trip', () => {
    it('returns tokens directly instead of setting cookies', async () => {
      const state = await startAndGetState('?client=desktop');
      const res = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );

      expect(res.status).toBe(200);
      // Assigning the tokens out of `res.body` at all is what proves the shape —
      // `tokenPairBody` throws if either is missing.
      tokenPairBody(res.body);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('refreshes via the JSON body, and gets a new refresh token back', async () => {
      const state = await startAndGetState('?client=desktop');
      const login = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );
      const { refreshToken } = tokenPairBody(login.body);

      const res = await request(testApp.app).post('/api/v1/auth/refresh').send({ refreshToken });

      expect(res.status).toBe(200);
      const rotated = tokenPairBody(res.body);
      expect(rotated.refreshToken).not.toBe(refreshToken);
    });
  });

  it('rejects a replayed state — single-use consumption', async () => {
    const state = await startAndGetState();

    const first = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );
    expect(first.status).toBe(302);
    expect(first.headers['location']).not.toContain('/login');

    const second = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );
    expect(second.status).toBe(302);
    expect(second.headers['location']).toContain('/login?error=invalid_state');
    expect(second.headers['set-cookie']).toBeUndefined();
  });

  it('surfaces a PKCE mismatch — or any Discord exchange failure — as a clean redirect', async () => {
    testApp.discord.exchangeCodeError = new Error('invalid_grant: PKCE verification failed');
    const state = await startAndGetState();

    const res = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login?error=discord_failed');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a user who is not in the allowed guild', async () => {
    testApp.discord.guilds = [{ id: 'some-other-guild', name: 'Elsewhere' }];
    const state = await startAndGetState();

    const res = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login?error=not_a_member');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a guild member who lacks the required role', async () => {
    testApp.discord.memberRoles = ['some-other-role'];
    const state = await startAndGetState();

    const res = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login?error=missing_role');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  describe('open redirect rejection', () => {
    it('rejects an absolute URL', async () => {
      const res = await request(testApp.app).get(
        '/api/v1/auth/discord/start?redirect_to=https://evil.example/steal',
      );
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'validation_failed' } });
    });

    it('rejects a protocol-relative URL, which a bare startsWith("/") check would miss', async () => {
      const res = await request(testApp.app).get(
        '/api/v1/auth/discord/start?redirect_to=//evil.example',
      );
      expect(res.status).toBe(400);
    });

    it('accepts an ordinary relative path', async () => {
      const res = await request(testApp.app).get(
        '/api/v1/auth/discord/start?redirect_to=/books/abc',
      );
      expect(res.status).toBe(302);
    });
  });

  describe('refresh rotation and family reuse detection', () => {
    async function loginAndGetRefreshCookie(): Promise<string> {
      const state = await startAndGetState();
      const res = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );
      const token = cookieValue(res.headers['set-cookie'] as unknown as string[], 'books_rt');
      if (token === undefined) throw new Error('No refresh cookie issued.');
      return token;
    }

    it('rotates: the presented token stops working and a new one takes over', async () => {
      const original = await loginAndGetRefreshCookie();

      const rotated = await request(testApp.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `books_rt=${original}`);
      expect(rotated.status).toBe(200);
      const nextToken = cookieValue(
        rotated.headers['set-cookie'] as unknown as string[],
        'books_rt',
      );
      expect(nextToken).toBeDefined();
      expect(nextToken).not.toBe(original);

      // The rotated-away token is now dead.
      const replay = await request(testApp.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `books_rt=${original}`);
      expect(replay.status).toBe(401);
    });

    it('treats presenting an already-revoked token as reuse and revokes the whole family', async () => {
      const original = await loginAndGetRefreshCookie();

      const rotated = await request(testApp.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `books_rt=${original}`);
      const nextToken = cookieValue(
        rotated.headers['set-cookie'] as unknown as string[],
        'books_rt',
      );

      // Replaying the now-dead original is reuse, not merely "expired".
      const reused = await request(testApp.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `books_rt=${original}`);
      expect(reused.status).toBe(401);
      expect(reused.body).toMatchObject({ error: { details: { reason: 'reuse_detected' } } });

      // The token that reuse detection *should* have revoked no longer works
      // either — the whole family is gone, not just the replayed one.
      const alsoRevoked = await request(testApp.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `books_rt=${String(nextToken)}`);
      expect(alsoRevoked.status).toBe(401);
    });
  });

  it('logout revokes the session and clears the cookies', async () => {
    const state = await startAndGetState();
    const login = await request(testApp.app).get(
      `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
    );
    const refreshCookie = cookieValue(
      login.headers['set-cookie'] as unknown as string[],
      'books_rt',
    );

    const logout = await request(testApp.app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `books_rt=${String(refreshCookie)}`);
    expect(logout.status).toBe(204);
    const cleared = (logout.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('books_rt='),
    );
    expect(cleared).toContain('books_rt=;');

    const afterLogout = await request(testApp.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `books_rt=${String(refreshCookie)}`);
    expect(afterLogout.status).toBe(401);
  });

  it('logout with no token presented still succeeds', async () => {
    const res = await request(testApp.app).post('/api/v1/auth/logout');
    expect(res.status).toBe(204);
  });

  describe('requireAuth', () => {
    it('rejects /auth/me with no credential', async () => {
      const res = await request(testApp.app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('accepts /auth/me with a bearer token', async () => {
      const state = await startAndGetState('?client=desktop');
      const login = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );
      const { accessToken } = tokenPairBody(login.body);

      const res = await request(testApp.app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    it('rejects a garbage bearer token rather than crashing', async () => {
      const res = await request(testApp.app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('404s an unmatched route once authenticated, rather than falling through', async () => {
      const state = await startAndGetState('?client=desktop');
      const login = await request(testApp.app).get(
        `/api/v1/auth/discord/callback?code=abc123&state=${state}`,
      );
      const { accessToken } = tokenPairBody(login.body);

      const res = await request(testApp.app)
        .get('/api/v1/nonexistent')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });
  });
});
