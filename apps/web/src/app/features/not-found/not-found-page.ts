import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p class="hint">There's nothing at this address.</p>
    <a routerLink="/" class="back-link">Back to activity</a>
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

    .back-link {
      display: inline-block;
      margin-top: 1.5rem;
      color: var(--mat-sys-primary);
    }
  `,
})
export class NotFoundPage {}
