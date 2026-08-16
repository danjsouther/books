import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { ShelfUpdate, UserBookStatus } from '@books/domain';

/** Mutations for one member's own shelf entry on one book — see the identical
 *  note on `BooksApi`. */
@Service()
export class ShelfApi {
  private readonly http = inject(HttpClient);

  update(bookId: string, patch: ShelfUpdate) {
    return this.http.patch<UserBookStatus>(`/api/v1/books/${bookId}/me`, patch);
  }

  remove(bookId: string) {
    return this.http.delete<void>(`/api/v1/books/${bookId}/me`);
  }
}
