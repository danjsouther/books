import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthStore } from '../../core/auth-store';

@Component({
  selector: 'app-login-page',
  imports: [MatButtonModule],
  template: `
    <h1>Sign in</h1>
    <p class="hint">This app is private to one Discord server's members.</p>
    <button mat-flat-button type="button" class="signin" (click)="signIn()">
      Sign in with Discord
    </button>
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .hint {
      margin-top: 0.5rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .signin {
      margin-top: 1.5rem;
    }
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
