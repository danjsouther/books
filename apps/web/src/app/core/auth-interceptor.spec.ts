import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth-interceptor';
import { HardNavigation } from './hard-navigation';

/** Stands in for `HardNavigation` so a test can assert on it instead of a real
 *  `window.location.href` assignment — same trick `FakeAuthStore` uses in
 *  `auth-guard.spec.ts`. */
class FakeHardNavigation {
  calls = 0;
  toLogin(): void {
    this.calls += 1;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let fakeNav: FakeHardNavigation;

  beforeEach(() => {
    fakeNav = new FakeHardNavigation();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: HardNavigation, useValue: fakeNav },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('passes non-401 responses through untouched', () => {
    let result: unknown;
    http.get('/api/v1/books').subscribe((r) => (result = r));
    httpMock.expectOne('/api/v1/books').flush({ items: [] });
    expect(result).toEqual({ items: [] });
  });

  it('refreshes once and retries the original request on a 401', () => {
    let result: unknown;
    http.get('/api/v1/books').subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/books').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', expiresIn: 900 });
    httpMock.expectOne('/api/v1/books').flush({ items: [] });

    expect(result).toEqual({ items: [] });
    expect(fakeNav.calls).toBe(0);
  });

  it('coalesces concurrent 401s into a single refresh call', () => {
    let booksResult: unknown;
    let seriesResult: unknown;
    http.get('/api/v1/books').subscribe((r) => (booksResult = r));
    http.get('/api/v1/series').subscribe((r) => (seriesResult = r));

    httpMock.expectOne('/api/v1/books').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/series').flush(null, { status: 401, statusText: 'Unauthorized' });

    // Exactly one refresh call services both — a second `expectOne` here would
    // throw if a duplicate refresh request had been fired.
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', expiresIn: 900 });

    httpMock.expectOne('/api/v1/books').flush({ items: [] });
    httpMock.expectOne('/api/v1/series').flush({ items: [] });

    expect(booksResult).toEqual({ items: [] });
    expect(seriesResult).toEqual({ items: [] });
  });

  it('propagates the original error and hard-redirects when refresh fails', () => {
    let error: unknown;
    http.get('/api/v1/books').subscribe({
      error: (e: unknown) => {
        error = e;
      },
    });

    httpMock.expectOne('/api/v1/books').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((error as { status: number }).status).toBe(401);
    expect(fakeNav.calls).toBe(1);
  });

  it('does not hard-redirect when /auth/me itself fails to refresh', () => {
    let error: unknown;
    http.get('/api/v1/auth/me').subscribe({
      error: (e: unknown) => {
        error = e;
      },
    });

    httpMock.expectOne('/api/v1/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((error as { status: number }).status).toBe(401);
    expect(fakeNav.calls).toBe(0);
  });

  it('does not retry a 401 from /auth/refresh or /auth/logout themselves', () => {
    let error: unknown;
    http.post('/api/v1/auth/refresh', {}).subscribe({
      error: (e: unknown) => {
        error = e;
      },
    });

    // Exactly one request total — if the interceptor recursed, `expectOne`
    // below would find more than one outstanding request and throw.
    httpMock
      .expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((error as { status: number }).status).toBe(401);
  });
});
