import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ListResponse, SeriesSummary } from '@books/domain';

@Component({
  selector: 'app-series-list-page',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold">Series</h1>
    @if (series.isLoading()) {
      <p class="mt-4 text-ink-muted">Loading…</p>
    }
    @if (series.hasValue()) {
      <ul class="mt-4 space-y-1">
        @for (s of series.value().items; track s.id) {
          <li>
            <a [routerLink]="[s.id]" class="underline">{{ s.name }}</a>
          </li>
        }
      </ul>
    }
  `,
})
export class SeriesListPage {
  // See `ActivityPage` for why every `value()` read is guarded by `hasValue()`.
  protected readonly series = httpResource<ListResponse<SeriesSummary>>(() => '/api/v1/series', {
    defaultValue: { items: [], page: 1, pageSize: 20, total: 0 },
  });
}
