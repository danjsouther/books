import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [
    RouterLink,
    PageHeader,
    ListToolbar,
    ResultCount,
    Skeleton,
    EmptyState,
    Pagination,
    MatButtonModule,
  ],
  template: `
    <app-page-header title="Series">
      <a mat-stroked-button routerLink="new">Add a series</a>
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
      <ul class="results">
        @for (series of store.items(); track series.id) {
          <li class="card">
            <a [routerLink]="[series.id]" class="title">{{ series.name }}</a>
            <p class="muted">
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
  styles: `
    .results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: 0.75rem;
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
    }

    .card {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 1rem;
    }

    .title {
      font-weight: 600;
      color: var(--mat-sys-primary);
      text-decoration: underline;
    }

    .muted {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0.25rem 0 0;
    }
  `,
})
export class SeriesListPage {
  protected readonly store = createListStore<SeriesSummary, SeriesListFilters>('/api/v1/series', {
    q: '',
    sort: 'name',
  });

  protected readonly sortOptions = SORT_OPTIONS;
}
