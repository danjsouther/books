import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CurrentUser } from '@books/domain';
import { AuthStore } from './auth-store';

describe('AuthStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is unauthenticated and unsettled before /auth/me resolves', () => {
    const auth = TestBed.inject(AuthStore);
    TestBed.tick();
    expect(auth.isSettled()).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    httpMock.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('becomes authenticated once /auth/me resolves with a user', async () => {
    const auth = TestBed.inject(AuthStore);
    TestBed.tick();
    const user: CurrentUser = {
      id: 'user-1',
      discordId: 'discord-1',
      username: 'tester',
      displayName: null,
      avatarHash: null,
      isAdmin: false,
    };
    httpMock.expectOne('/api/v1/auth/me').flush(user);
    // The resource's status update lands on a microtask, not synchronously with
    // `flush()` — a bare `TestBed.tick()` runs too early to observe it.
    await Promise.resolve();
    TestBed.tick();

    expect(auth.isSettled()).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()).toEqual(user);
  });

  it('is settled but not authenticated after a 401', async () => {
    const auth = TestBed.inject(AuthStore);
    TestBed.tick();
    httpMock.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    TestBed.tick();

    expect(auth.isSettled()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('isAdmin reflects the resolved user', async () => {
    const auth = TestBed.inject(AuthStore);
    TestBed.tick();
    const user: CurrentUser = {
      id: 'user-1',
      discordId: 'discord-1',
      username: 'admin',
      displayName: null,
      avatarHash: null,
      isAdmin: true,
    };
    httpMock.expectOne('/api/v1/auth/me').flush(user);
    await Promise.resolve();
    TestBed.tick();

    expect(auth.isAdmin()).toBe(true);
  });
});
