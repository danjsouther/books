import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { authGuard } from './auth-guard';
import { AuthStore } from './auth-store';

/** The guard's redirect result is a `UrlTree`, not a string — `.toString()`
 *  serialises it back to a path for the assertions below. */
function urlOf(value: unknown): string {
  if (!(value instanceof UrlTree)) throw new Error('Expected a UrlTree redirect.');
  return value.toString();
}

/** A stand-in for `AuthStore` whose signals the test controls directly, so the
 *  guard can be tested without a real HTTP round trip. */
class FakeAuthStore {
  readonly isSettled = signal(true);
  readonly isAuthenticated = signal(false);
}

function runGuard(): ReturnType<typeof authGuard> {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url: '/books' } as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  let fakeAuth: FakeAuthStore;

  beforeEach(() => {
    fakeAuth = new FakeAuthStore();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: fakeAuth }],
    });
  });

  it('allows navigation once authenticated', async () => {
    fakeAuth.isAuthenticated.set(true);
    const result = runGuard();
    const value = isObservable(result) ? await firstValueFrom(result) : await result;
    expect(value).toBe(true);
  });

  it('redirects to /login with returnUrl when not authenticated', async () => {
    fakeAuth.isAuthenticated.set(false);
    const result = runGuard();
    const value = isObservable(result) ? await firstValueFrom(result) : await result;
    const url = urlOf(value);
    expect(url).toContain('/login');
    expect(url).toContain('returnUrl');
    expect(url).toContain(encodeURIComponent('/books'));
  });

  it('waits for the resource to settle before deciding', async () => {
    fakeAuth.isSettled.set(false);
    fakeAuth.isAuthenticated.set(true);
    const result = runGuard();
    if (!isObservable(result)) throw new Error('Expected an Observable.');

    let resolved = false;
    const promise = firstValueFrom(result).then((v) => {
      resolved = true;
      return v;
    });

    // Give any synchronous emission a chance to land — there should be none yet.
    await Promise.resolve();
    expect(resolved).toBe(false);

    fakeAuth.isSettled.set(true);
    TestBed.tick();

    expect(await promise).toBe(true);
    expect(resolved).toBe(true);
  });
});
