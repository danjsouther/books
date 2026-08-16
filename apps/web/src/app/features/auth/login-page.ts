import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../core/auth-store';

@Component({
  selector: 'app-login-page',
  imports: [],
  template: `
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <p class="mt-2 text-ink-muted">This app is private to one Discord server's members.</p>
    <button type="button" class="mt-6 rounded-sm border border-border px-4 py-2" (click)="signIn()">
      Sign in with Discord
    </button>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

  constructor() {
    // A stale `/login` deep link after a session already exists — e.g. the back
    // button — should land the member back where they were, not show a sign-in
    // button they no longer need.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigateByUrl(this.returnUrl);
      }
    });
  }

  protected signIn(): void {
    this.auth.login(this.returnUrl);
  }
}
