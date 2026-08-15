import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@books/domain';
import type { NextFunction, Request, Response } from 'express';
import type { AuthConfig } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning false, and
  // the lengths themselves are not secret, so comparing them first is safe.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Three independent layers, because none of them is sufficient alone:
 *
 * 1. `SameSite=Lax` on `books_at` blocks cross-site POST, but still permits a
 *    top-level cross-site *GET* to carry the cookie — which is exactly why no GET
 *    route may ever mutate state.
 * 2. Double-submit: the client must echo the `XSRF-TOKEN` cookie's value back in
 *    an `X-XSRF-TOKEN` header. A cross-site attacker can make the browser send
 *    the cookie automatically but cannot *read* it to set the header — that is
 *    the entire mechanism. Enforced **only when `authMethod === 'cookie'`**:
 *    bearer requests carry no ambient credential a page could forge in the first
 *    place. Getting this branch backwards — checking it for bearer requests, or
 *    skipping it for cookie ones — is the failure mode, so it is unit-tested
 *    directly rather than only through an integration path.
 * 3. `Origin`/`Referer` must match `publicBaseUrl`, when the browser sent one.
 *    Non-browser clients (the bot, a future service token) do not send these
 *    headers at all, so their absence is not itself a failure — only a mismatch
 *    is.
 */
export function csrfProtection(auth: Pick<AuthConfig, 'publicBaseUrl'>) {
  const expectedOrigin = new URL(auth.publicBaseUrl).origin;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.headers.origin ?? req.headers.referer;
    if (origin !== undefined) {
      let originValue: string;
      try {
        originValue = new URL(origin).origin;
      } catch {
        next(new AppError('forbidden', 'Malformed Origin or Referer header.'));
        return;
      }
      if (originValue !== expectedOrigin) {
        next(new AppError('forbidden', 'Cross-site request rejected.'));
        return;
      }
    }

    if (req.authMethod === 'cookie') {
      const cookies = req.cookies as Record<string, string> | undefined;
      const cookieToken = cookies?.['XSRF-TOKEN'];
      const headerToken = req.headers['x-xsrf-token'];
      const header = typeof headerToken === 'string' ? headerToken : undefined;

      if (
        cookieToken === undefined ||
        header === undefined ||
        !constantTimeEquals(cookieToken, header)
      ) {
        next(new AppError('forbidden', 'Missing or invalid CSRF token.'));
        return;
      }
    }

    next();
  };
}
