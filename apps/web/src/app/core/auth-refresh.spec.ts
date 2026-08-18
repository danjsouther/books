import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthRefresh } from './auth-refresh';

describe('AuthRefresh', () => {
  let service: AuthRefresh;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthRefresh);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shares one in-flight request across concurrent callers', () => {
    let a: unknown;
    let b: unknown;
    service.refresh().subscribe((r) => (a = r));
    service.refresh().subscribe((r) => (b = r));

    httpMock.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', expiresIn: 900 });

    expect(a).toEqual({ accessToken: 'new', expiresIn: 900 });
    expect(b).toEqual({ accessToken: 'new', expiresIn: 900 });
  });

  it('starts a new request once the previous one has settled', () => {
    service.refresh().subscribe();
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'first', expiresIn: 900 });

    service.refresh().subscribe();
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'second', expiresIn: 900 });
  });
});
