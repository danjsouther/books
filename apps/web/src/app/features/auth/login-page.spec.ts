import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AuthStore } from '../../core/auth-store';
import { LoginPage } from './login-page';

class FakeAuthStore {
  readonly isAuthenticated = signal(false);
  readonly login = vi.fn();
}

function configure(returnUrl: string | null) {
  const fakeAuth = new FakeAuthStore();
  const navigateByUrl = vi.fn().mockResolvedValue(true);

  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      { provide: AuthStore, useValue: fakeAuth },
      { provide: Router, useValue: { navigateByUrl } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(returnUrl === null ? {} : { returnUrl }),
          },
        },
      },
    ],
  });

  return { fakeAuth, navigateByUrl };
}

describe('LoginPage', () => {
  it('sends the returnUrl query param through to AuthStore.login on sign-in', () => {
    const { fakeAuth } = configure('/books/abc');
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button')?.click();

    expect(fakeAuth.login).toHaveBeenCalledWith('/books/abc');
  });

  it('defaults returnUrl to / when none is present', () => {
    const { fakeAuth } = configure(null);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button')?.click();

    expect(fakeAuth.login).toHaveBeenCalledWith('/');
  });

  it('redirects immediately instead of showing the button when already authenticated', () => {
    const { navigateByUrl } = configure('/books');
    const fixture = TestBed.createComponent(LoginPage);
    (TestBed.inject(AuthStore) as unknown as FakeAuthStore).isAuthenticated.set(true);
    fixture.detectChanges();
    TestBed.tick();

    expect(navigateByUrl).toHaveBeenCalledWith('/books');
  });
});
