import { httpResource } from '@angular/common/http';
import { Service, computed } from '@angular/core';
import type { CurrentUser } from '@books/domain';

/**
 * There is no client-readable auth cookie by design — `books_at` is httpOnly. The
 * only way to know whether a visitor is signed in is to ask the server, so `user`
 * is seeded from one `GET /auth/me` on boot rather than read from any local state.
 */
@Service()
export class AuthStore {
  private readonly me = httpResource<CurrentUser | null>(() => '/api/v1/auth/me', {
    defaultValue: null,
  });

  // `value()` throws when the resource is in its error state — which a 401 on an
  // anonymous visit always is — rather than falling back to `defaultValue` the way
  // it does while idle/loading. `hasValue()` is the guard that makes reading it
  // safe in every state.
  readonly user = computed(() => (this.me.hasValue() ? this.me.value() : null));

  /** `false` while loading and on a 401 alike — callers that need to distinguish
   *  "not yet known" from "known to be signed out" should read `isSettled` too. */
  readonly isAuthenticated = computed(
    () => this.me.status() === 'resolved' && this.user() !== null,
  );

  readonly isAdmin = computed(() => this.user()?.isAdmin ?? false);

  /** `/auth/me` 401s for an anonymous visitor, which `httpResource` reports as
   *  status `'error'`, not an exception — a settled "signed out" is just as valid
   *  an end state as a settled "signed in", so this checks for "not still in
   *  flight" rather than only the success status. */
  readonly isSettled = computed(() => {
    const status = this.me.status();
    return status !== 'idle' && status !== 'loading';
  });

  /** OAuth needs a real top-level navigation, not an XHR — a full-page redirect is
   *  the point, not a workaround. */
  login(redirectTo: string): void {
    const url = new URL('/api/v1/auth/discord/start', window.location.origin);
    url.searchParams.set('redirect_to', redirectTo);
    window.location.href = url.toString();
  }
}
