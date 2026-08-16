import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthStore } from './core/auth-store';
import { routes } from './app.routes';

class FakeAuthStore {
  readonly isSettled = signal(true);
  readonly isAuthenticated = signal(false);
}

describe('app routing', () => {
  let fakeAuth: FakeAuthStore;

  beforeEach(() => {
    fakeAuth = new FakeAuthStore();
    TestBed.configureTestingModule({
      teardown: { destroyAfterEach: true },
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: fakeAuth },
      ],
    });
  });

  it('renders the not-found page for an unmatched path', async () => {
    const harness = await RouterTestingHarness.create('/this-page-does-not-exist');
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Page not found');
  });

  it('redirects an unauthenticated visit to a protected route to /login with returnUrl', async () => {
    fakeAuth.isAuthenticated.set(false);
    const harness = await RouterTestingHarness.create('/books');
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
  });

  it('allows an authenticated visit through to the route', async () => {
    fakeAuth.isAuthenticated.set(true);
    const harness = await RouterTestingHarness.create('/activity');
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Activity');
  });
});
