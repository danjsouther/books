import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateChildFn } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth-store';

/**
 * Guards everything except `/login`. Waits for `AuthStore`'s bootstrap request to
 * settle before deciding — reading `isAuthenticated()` while it is still loading
 * would redirect a signed-in member on every first paint, since the resource has
 * not resolved to `true` yet.
 */
export const authGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return toObservable(auth.isSettled).pipe(
    filter((settled) => settled),
    take(1),
    map(() =>
      auth.isAuthenticated()
        ? true
        : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
    ),
  );
};
