import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SeriesSummary } from '@books/domain';
import { createListStore } from '../../core/list-store';
import { EmptyState } from '../../shared/ui/empty-state';
import { ListToolbar, type SortOption } from '../../shared/ui/list-toolbar';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { ResultCount } from '../../shared/ui/result-count';
import { Skeleton } from '../../shared/ui/skeleton';

interface SeriesListFilters extends Record<string, unknown> {
  readonly q: string;
  readonly sort: string;
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'bookCount', label: 'Book count' },
  { value: 'nextRelease', label: 'Next release' },
];

@Component({
  selector: 'app-series-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ResultCount, Skeleton, EmptyState, Pagination],
  template: `
    <app-page-header title="Series">
      <a routerLink="new" class="rounded-sm border border-border px-3 py-1.5 text-sm"
        >Add a series</a
      >
    </app-page-header>

    <app-list-toolbar
      searchLabel="Search series"
      [query]="store.filters().q"
      (queryChange)="store.setFilter('q', $event)"
      [sortOptions]="sortOptions"
      [sortValue]="store.filters().sort"
      (sortValueChange)="store.setFilter('sort', $event)"
    />

    <app-result-count [total]="store.total()" noun="series" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state title="No series match your search" />
    } @else {
      <ul class="mt-4 grid gap-3 sm:grid-cols-2">
        @for (series of store.items(); track series.id) {
          <li class="rounded-md border border-border p-4">
            <a [routerLink]="[series.id]" class="font-medium underline">{{ series.name }}</a>
            <p class="mt-1 text-sm text-ink-muted">
              {{ series.bookCount }} {{ series.bookCount === 1 ? 'book' : 'books' }}
              @if (series.nextRelease) {
                · next release {{ series.nextRelease }}
              }
            </p>
          </li>
        }
      </ul>
    }

    <app-pagination
      [page]="store.page()"
      [pageSize]="store.pageSize()"
      [total]="store.total()"
      (goToPage)="store.goToPage($event)"
    />
  `,
})
export class SeriesListPage {
  protected readonly store = createListStore<SeriesSummary, SeriesListFilters>('/api/v1/series', {
    q: '',
    sort: 'name',
  });

  protected readonly sortOptions = SORT_OPTIONS;
}
