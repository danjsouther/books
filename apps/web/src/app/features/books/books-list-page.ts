import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BookSummary, ListResponse } from '@books/domain';

@Component({
  selector: 'app-books-list-page',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold">Books</h1>
    @if (books.isLoading()) {
      <p class="mt-4 text-ink-muted">Loading…</p>
    }
    @if (books.hasValue()) {
      <ul class="mt-4 space-y-1">
        @for (book of books.value().items; track book.id) {
          <li>
            <a [routerLink]="[book.id]" class="underline">{{ book.title }}</a>
          </li>
        }
      </ul>
    }
  `,
})
export class BooksListPage {
  // See `ActivityPage` for why every `value()` read is guarded by `hasValue()`.
  protected readonly books = httpResource<ListResponse<BookSummary>>(() => '/api/v1/books', {
    defaultValue: { items: [], page: 1, pageSize: 20, total: 0 },
  });
}
