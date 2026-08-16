import { Component, input } from '@angular/core';

/** The real detail page — history, shelf status, ratings — is Phase 6. This proves
 *  `withComponentInputBinding()` delivers the route's `:id` as an `input()` signal. */
@Component({
  selector: 'app-book-detail-page',
  imports: [],
  template: `<h1 class="text-2xl font-semibold">Book {{ id() }}</h1>`,
})
export class BookDetailPage {
  readonly id = input.required<string>();
}
