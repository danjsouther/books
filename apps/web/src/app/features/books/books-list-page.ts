import { httpResource } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'title', label: 'Title' },
  { value: 'release', label: 'Release date' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'rating', label: 'Rating' },
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
  ],
  template: `
    <app-page-header title="Books">
      <a routerLink="new" class="rounded-sm border border-border px-3 py-1.5 text-sm">Add a book</a>
    </app-page-header>

    <app-list-toolbar
      searchLabel="Search books"
      [query]="store.filters().q"
      (queryChange)="store.setFilter('q', $event)"
      [sortOptions]="sortOptions"
      [sortValue]="store.filters().sort"
      (sortValueChange)="store.setFilter('sort', $event)"
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
      <app-select
        ariaLabel="Filter by status"
        [options]="statusOptions"
        [value]="store.filters().status || null"
        (valueChange)="store.setFilter('status', $event ?? '')"
      />
    </app-list-toolbar>

    <app-result-count [total]="store.total()" noun="books" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state
        title="No books match your filters"
        hint="Try clearing a filter or search term."
      />
    } @else {
      <ul class="mt-4 grid gap-3 sm:grid-cols-2">
        @for (book of store.items(); track book.id) {
          <li class="rounded-md border border-border p-4">
            <a [routerLink]="[book.id]" class="font-medium underline">{{ book.title }}</a>
            @if (book.authors.length > 0) {
              <p class="text-sm text-ink-muted">{{ authorNames(book) }}</p>
            }
            <p class="mt-2 text-sm text-ink-muted">
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
})
export class BooksListPage {
  protected readonly store = createListStore<BookSummary, BookListFilters>('/api/v1/books', {
    q: '',
    seriesId: '',
    status: '',
    sort: 'title',
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
