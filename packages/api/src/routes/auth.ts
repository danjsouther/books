import { AppError } from '@books/domain';
import type { CurrentUser, RefreshResponse } from '@books/domain';
import { findUserById, upsertUserFromDiscord } from '@books/db';
import { insertOauthState, consumeOauthState } from '@books/db';
import { Router, type Request } from 'express';
import { clearSessionCookies, setSessionCookies } from '../auth/cookies';
import { codeChallengeS256, generateCodeVerifier, generateState } from '../auth/pkce';
import { DEFAULT_REDIRECT_TARGET, isSafeRedirectTarget } from '../auth/redirect-target';
import { issueSession, revokeSession, rotateSession, type SessionMeta } from '../auth/session';
import type { Client } from '../auth/tokens';
import { requireAuth } from '../middleware/auth-context';
import type { ApiDeps } from '../types';

const STATE_TTL_MS = 10 * 60 * 1000;

function sessionMeta(req: Request): SessionMeta {
  const rawUserAgent = req.headers['user-agent'];
  return {
    userAgent: typeof rawUserAgent === 'string' ? rawUserAgent : null,
    ip: req.ip ?? null,
  };
}

function loginErrorRedirect(publicBaseUrl: string, code: string): string {
  const url = new URL('/login', publicBaseUrl);
  url.searchParams.set('error', code);
  return url.toString();
}

/** The refresh token, wherever the caller put it — `books_rt` for a browser with
 *  a cookie jar, the JSON body for a client that has none. */
function readPresentedRefreshToken(req: Request): { token: string; via: 'cookie' | 'body' } | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.['books_rt'];
  if (cookieToken !== undefined) return { token: cookieToken, via: 'cookie' };

  const body = req.body as { refreshToken?: unknown } | undefined;
  if (typeof body?.refreshToken === 'string' && body.refreshToken !== '') {
    return { token: body.refreshToken, via: 'body' };
  }
  return null;
}

function toCurrentUser(user: Awaited<ReturnType<typeof findUserById>>): CurrentUser {
  if (user === undefined) throw new AppError('not_found', 'No such user.');
  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    displayName: user.displayName,
    avatarHash: user.avatarHash,
    isAdmin: user.isAdmin,
  };
}

export function createAuthRouter(deps: ApiDeps): Router {
  const router = Router();
  const { db, auth, discord } = deps;

  router.get('/discord/start', (req, res, next) => {
    void (async () => {
      const clientParam = req.query['client'];
      const client: Client = clientParam === 'desktop' ? 'desktop' : 'web';
      if (clientParam !== undefined && clientParam !== 'web' && clientParam !== 'desktop') {
        throw new AppError('validation_failed', "client must be 'web' or 'desktop'.");
      }

      const redirectParam = req.query['redirect_to'];
      const redirectTo =
        typeof redirectParam === 'string' ? redirectParam : DEFAULT_REDIRECT_TARGET;
      if (!isSafeRedirectTarget(redirectTo)) {
        throw new AppError('validation_failed', 'redirect_to must be a relative path.');
      }

      const state = generateState();
      const codeVerifier = generateCodeVerifier();

      await insertOauthState(db, {
        state,
        codeVerifier,
        redirectTo,
        client,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      });

      const authorizeUrl = discord.buildAuthorizeUrl({
        clientId: auth.discordClientId,
        redirectUri: auth.discordRedirectUri,
        state,
        codeChallenge: codeChallengeS256(codeVerifier),
      });
      res.redirect(302, authorizeUrl);
    })().catch(next);
  });

  router.get('/discord/callback', (req, res) => {
    void (async () => {
      const code = req.query['code'];
      const state = req.query['state'];
      if (typeof code !== 'string' || typeof state !== 'string') {
        res.redirect(302, loginErrorRedirect(auth.publicBaseUrl, 'missing_params'));
        return;
      }

      const consumed = await consumeOauthState(db, state);
      if (consumed === undefined) {
        res.redirect(302, loginErrorRedirect(auth.publicBaseUrl, 'invalid_state'));
        return;
      }

      let discordUser;
      let guilds;
      try {
        const tokens = await discord.exchangeCode({
          clientId: auth.discordClientId,
          clientSecret: auth.discordClientSecret,
          redirectUri: auth.discordRedirectUri,
          code,
          codeVerifier: consumed.codeVerifier,
        });
        // Discord's own tokens are used for exactly these two calls and then
        // discarded — we never act on the user's behalf again, so storing them
        // would be pure liability.
        [discordUser, guilds] = await Promise.all([
          discord.fetchUser(tokens.access_token),
          discord.fetchGuilds(tokens.access_token),
        ]);
      } catch {
        res.redirect(302, loginErrorRedirect(auth.publicBaseUrl, 'discord_failed'));
        return;
      }

      const isMember = guilds.some((g) => g.id === auth.discordAllowedGuildId);
      if (!isMember) {
        res.redirect(302, loginErrorRedirect(auth.publicBaseUrl, 'not_a_member'));
        return;
      }

      const user = await upsertUserFromDiscord(db, {
        discordId: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name,
        avatarHash: discordUser.avatar,
      });

      const client: Client = consumed.client === 'desktop' ? 'desktop' : 'web';
      const session = await issueSession(db, auth, user.id, client, sessionMeta(req));

      if (client === 'desktop') {
        // No loopback or custom-protocol handoff exists yet — Electron is
        // deliberately not built (see docs/TODO.md) — so for now the desktop
        // path gets its tokens directly rather than through a redirect it has
        // nowhere to receive.
        res.status(200).json({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        });
        return;
      }

      setSessionCookies(
        res,
        {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          csrfToken: session.csrfToken,
        },
        auth,
      );
      res.redirect(
        302,
        new URL(consumed.redirectTo ?? DEFAULT_REDIRECT_TARGET, auth.publicBaseUrl).toString(),
      );
    })().catch(() => {
      res.redirect(302, loginErrorRedirect(auth.publicBaseUrl, 'internal_error'));
    });
  });

  router.post('/refresh', (req, res, next) => {
    void (async () => {
      const presented = readPresentedRefreshToken(req);
      if (presented === null) {
        throw new AppError('unauthenticated', 'No refresh token presented.');
      }

      const session = await rotateSession(db, auth, presented.token, sessionMeta(req));

      if (presented.via === 'cookie') {
        setSessionCookies(
          res,
          {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            csrfToken: session.csrfToken,
          },
          auth,
        );
        const body: RefreshResponse = {
          accessToken: session.accessToken,
          expiresIn: session.expiresIn,
        };
        res.status(200).json(body);
        return;
      }

      // No cookie jar to update — the caller must store the new refresh token
      // itself, so it comes back in the body instead of only a fresh access
      // token.
      res.status(200).json({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
      });
    })().catch(next);
  });

  router.post('/logout', (req, res, next) => {
    void (async () => {
      const presented = readPresentedRefreshToken(req);
      if (presented !== null) {
        // Best-effort: an already-invalid token still results in a clean
        // logout rather than an error the client has no useful response to.
        await revokeSession(db, presented.token).catch(() => undefined);
      }
      clearSessionCookies(res, auth);
      res.status(204).end();
    })().catch(next);
  });

  router.get('/me', requireAuth, (req, res, next) => {
    void (async () => {
      const userId = req.user?.id;
      if (userId === undefined) throw new AppError('unauthenticated', 'Sign in required.');
      const user = await findUserById(db, userId);
      res.json(toCurrentUser(user));
    })().catch(next);
  });

  return router;
}
