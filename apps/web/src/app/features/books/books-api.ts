import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { BookCreate, BookDetail, BookUpdate } from '@books/domain';

/** Mutations only — reads go through `httpResource` directly on the consuming
 *  page, per the master plan's split between reads and writes. */
@Service()
export class BooksApi {
  private readonly http = inject(HttpClient);

  create(input: BookCreate) {
    return this.http.post<BookDetail>('/api/v1/books', input);
  }

  update(id: string, patch: BookUpdate) {
    return this.http.patch<BookDetail>(`/api/v1/books/${id}`, patch);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/v1/books/${id}`);
  }

  restore(id: string) {
    return this.http.post<BookDetail>(`/api/v1/books/${id}/restore`, {});
  }

  revert(id: string, toVersion: number, note: string | null = null) {
    return this.http.post<BookDetail>(`/api/v1/books/${id}/revert`, { toVersion, note });
  }
}
