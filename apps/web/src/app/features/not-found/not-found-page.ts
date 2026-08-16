import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold">Page not found</h1>
    <p class="mt-2 text-ink-muted">There's nothing at this address.</p>
    <a routerLink="/" class="mt-6 inline-block underline">Back to activity</a>
  `,
})
export class NotFoundPage {}
