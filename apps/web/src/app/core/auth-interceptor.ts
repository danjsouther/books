import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthRefresh } from './auth-refresh';
import { HardNavigation } from './hard-navigation';

const ME_URL = '/api/v1/auth/me';
const RETRY_EXEMPT_URLS = new Set(['/api/v1/auth/refresh', '/api/v1/auth/logout']);

/**
 * Every request gets one silent-refresh-and-retry on a 401. `/auth/refresh` and
 * `/auth/logout` are exempt outright — retrying either would recurse into this
 * same interceptor. `/auth/me`'s own 401 is retried like any other request (this
 * is what lets a stale-access-token page *reload*, not just an in-app 401, resume
 * a still-valid session) but never triggers the redirect below: it fires on every
 * app boot, signed in or not, and forcing a genuinely signed-out visitor off
 * `/login` — where this exact request also runs — would loop. Every other
 * request only reaches here after `authGuard` has already confirmed a session
 * exists, so a refresh failure there means the session died mid-use.
 *
 * Only one retry is ever attempted, by construction: a second 401 from the
 * retried `next(req)` call is not wrapped in another `catchError`, so it just
 * propagates to the caller like any ordinary failed request.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (RETRY_EXEMPT_URLS.has(req.url)) return next(req);

  const authRefresh = inject(AuthRefresh);
  const hardNavigation = inject(HardNavigation);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      return authRefresh.refresh().pipe(
        catchError(() => {
          if (req.url !== ME_URL) hardNavigation.toLogin();
          // The refresh's own error isn't what the caller asked about — the
          // original request's failure is still the meaningful one to surface.
          return throwError(() => err);
        }),
        switchMap(() => next(req)),
      );
    }),
  );
};
