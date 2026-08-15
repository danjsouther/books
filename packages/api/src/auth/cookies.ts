import type { Response } from 'express';
import type { AuthConfig } from '../types';

const SECOND = 1000;

export interface SessionCookies {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
}

/**
 * The cookie value *is* the bearer token — there is no separate session store —
 * which is what makes the web app "a thin wrapper over the same tokens" literal
 * rather than aspirational.
 */
export function setSessionCookies(res: Response, cookies: SessionCookies, auth: AuthConfig): void {
  const shared = {
    secure: auth.cookieSecure,
    domain: auth.cookieDomain,
  };

  res.cookie('books_at', cookies.accessToken, {
    ...shared,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: auth.accessTtlSeconds * SECOND,
  });

  res.cookie('books_rt', cookies.refreshToken, {
    ...shared,
    httpOnly: true,
    // Strict, and scoped to the auth path only — it must never ride along on an
    // asset request, and Strict means it is never sent cross-site at all, which
    // is what makes a CSRF attack against /auth/refresh structurally impossible
    // rather than merely checked for.
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: auth.refreshTtlSeconds * SECOND,
  });

  res.cookie('XSRF-TOKEN', cookies.csrfToken, {
    ...shared,
    // Deliberately NOT httpOnly — the whole double-submit mechanism depends on
    // same-origin JavaScript being able to read this and echo it in a header.
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    // Tied to the refresh token's lifetime rather than the access token's: its
    // value only needs regenerating when the session itself restarts, and there
    // is no reason to force it shorter than that.
    maxAge: auth.refreshTtlSeconds * SECOND,
  });
}

export function clearSessionCookies(res: Response, auth: AuthConfig): void {
  const shared = { secure: auth.cookieSecure, domain: auth.cookieDomain };
  res.clearCookie('books_at', { ...shared, httpOnly: true, sameSite: 'lax', path: '/' });
  res.clearCookie('books_rt', {
    ...shared,
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
  res.clearCookie('XSRF-TOKEN', { ...shared, httpOnly: false, sameSite: 'lax', path: '/' });
}
