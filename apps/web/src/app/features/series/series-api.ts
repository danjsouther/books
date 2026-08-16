import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { SeriesCreate, SeriesDetail, SeriesUpdate } from '@books/domain';

/** Mutations only — see the identical note on `BooksApi`. */
@Service()
export class SeriesApi {
  private readonly http = inject(HttpClient);

  create(input: SeriesCreate) {
    return this.http.post<SeriesDetail>('/api/v1/series', input);
  }

  update(id: string, patch: SeriesUpdate) {
    return this.http.patch<SeriesDetail>(`/api/v1/series/${id}`, patch);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/v1/series/${id}`);
  }

  restore(id: string) {
    return this.http.post<SeriesDetail>(`/api/v1/series/${id}/restore`, {});
  }

  revert(id: string, toVersion: number, note: string | null = null) {
    return this.http.post<SeriesDetail>(`/api/v1/series/${id}/revert`, { toVersion, note });
  }
}
