import { httpResource } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  BOOK_STATUSES,
  formatReleaseDate,
  type BookSummary,
  type ListResponse,
} from '@books/domain';
import { createListStore } from '../../core/list-store';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { EmptyState } from '../../shared/ui/empty-state';
import { ListToolbar, type SortOption } from '../../shared/ui/list-toolbar';
import { Pagination } from '../../shared/ui/pagination';
import { PageHeader } from '../../shared/ui/page-header';
import { ResultCount } from '../../shared/ui/result-count';
import { AppSelect, type SelectOption } from '../../shared/ui/select';
import { Skeleton } from '../../shared/ui/skeleton';

interface BookListFilters extends Record<string, unknown> {
  readonly q: string;
  readonly seriesId: string;
  readonly status: string;
  readonly sort: string;
  readonly dir: 'asc' | 'desc';
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'title', label: 'Title', defaultDir: 'asc' },
  { value: 'release', label: 'Release date', defaultDir: 'asc' },
  { value: 'updated', label: 'Recently updated', defaultDir: 'desc' },
  { value: 'rating', label: 'Rating', defaultDir: 'desc' },
];

const STATUS_OPTIONS: readonly SelectOption[] = BOOK_STATUSES.map((s) => ({ id: s, label: s }));

@Component({
  selector: 'app-books-list-page',
  imports: [
    RouterLink,
    PageHeader,
    ListToolbar,
    AppCombobox,
    AppSelect,
    ResultCount,
    Skeleton,
    EmptyState,
    Pagination,
    MatButtonModule,
  ],
  template: `
    <app-page-header title="Books">
      <a mat-stroked-button routerLink="new">Add a book</a>
    </app-page-header>

    <app-list-toolbar
      searchLabel="Search books"
      [query]="store.filters().q"
      (queryChange)="store.setFilter('q', $event)"
      [sortOptions]="sortOptions"
      [sortValue]="store.filters().sort"
      (sortValueChange)="store.setFilter('sort', $event)"
      [sortDir]="store.filters().dir"
      (sortDirChange)="store.setFilter('dir', $event)"
    >
      <app-combobox
        placeholder="Filter by series"
        ariaLabel="Filter by series"
        [options]="seriesOptions()"
        [queryText]="seriesQuery()"
        (queryTextChange)="seriesQuery.set($event)"
        [value]="store.filters().seriesId || null"
        (valueChange)="store.setFilter('seriesId', $event ?? '')"
      />
    </app-list-toolbar>

    <div class="status-row">
      <app-select
        ariaLabel="Filter by status"
        [options]="statusOptions"
        [value]="store.filters().status || null"
        (valueChange)="store.setFilter('status', $event ?? '')"
      />
    </div>

    <app-result-count [total]="store.total()" noun="books" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state
        title="No books match your filters"
        hint="Try clearing a filter or search term."
      />
    } @else {
      <ul class="results">
        @for (book of store.items(); track book.id) {
          <li class="card">
            <a [routerLink]="[book.id]" class="title">{{ book.title }}</a>
            @if (book.authors.length > 0) {
              <p class="muted">{{ authorNames(book) }}</p>
            }
            <p class="muted release-date">
              {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
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
    .status-row {
      margin-top: 1rem;
    }

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

    .release-date {
      margin-top: 0.5rem;
    }
  `,
})
export class BooksListPage {
  protected readonly store = createListStore<BookSummary, BookListFilters>('/api/v1/books', {
    q: '',
    seriesId: '',
    status: '',
    sort: 'title',
    dir: 'asc',
  });

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly formatReleaseDate = formatReleaseDate;

  protected readonly seriesQuery = signal('');
  private readonly seriesResource = httpResource<ListResponse<{ id: string; name: string }>>(
    () => ({ url: '/api/v1/series', params: { q: this.seriesQuery(), pageSize: 10 } }),
    { defaultValue: { items: [], page: 1, pageSize: 10, total: 0 } },
  );
  protected readonly seriesOptions = computed<ComboboxOption[]>(() =>
    (this.seriesResource.hasValue() ? this.seriesResource.value().items : []).map((s) => ({
      id: s.id,
      label: s.name,
    })),
  );

  protected authorNames(book: BookSummary): string {
    return book.authors.map((a) => a.name).join(', ');
  }
}
