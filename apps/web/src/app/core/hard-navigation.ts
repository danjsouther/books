import { Service } from '@angular/core';

/** A real top-level navigation, not an XHR — same reasoning as `AuthStore.login()`:
 *  a dead session needs every in-memory store (including `AuthStore`'s own
 *  resolved `httpResource`) to reset cleanly, and fighting `httpResource`'s
 *  status machine to force it back to "unauthenticated" from outside is more
 *  fragile than just reloading. Wrapped in a service, not called inline, so
 *  tests can swap it the way `auth-guard.spec.ts` swaps `AuthStore`. */
@Service()
export class HardNavigation {
  toLogin(): void {
    const returnUrl = window.location.pathname + window.location.search;
    const url = new URL('/login', window.location.origin);
    url.searchParams.set('returnUrl', returnUrl);
    window.location.href = url.toString();
  }
}
