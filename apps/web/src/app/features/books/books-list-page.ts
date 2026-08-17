import { httpResource } from '@angular/common/http';
import { Component, computed, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  BOOK_STATUSES,
  formatReleaseDate,
  type BookSummary,
  type ListResponse,
} from '@books/domain';
import { createListStore } from '../../core/list-store';
import { BookCover } from '../../shared/ui/book-cover';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { EmptyState } from '../../shared/ui/empty-state';
import { ListToolbar, type SortOption } from '../../shared/ui/list-toolbar';
import { Pagination } from '../../shared/ui/pagination';
import { PageHeader } from '../../shared/ui/page-header';
import { ResultCount } from '../../shared/ui/result-count';
import { AppSelect, type SelectOption } from '../../shared/ui/select';
import { Skeleton } from '../../shared/ui/skeleton';
import { ViewToggle, type ListView } from '../../shared/ui/view-toggle';

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

/** Which layout the member last chose. Plain `localStorage` with no platform
 *  guard: this app is browser-only (no SSR builder is configured), and a view
 *  preference is not worth a store of its own until a second page wants one. */
const VIEW_STORAGE_KEY = 'books.view';

function readStoredView(): ListView {
  const stored = localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

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
    BookCover,
    ViewToggle,
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
      <app-view-toggle [(value)]="view" />
    </div>

    <app-result-count [total]="store.total()" noun="books" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state
        title="No books match your filters"
        hint="Try clearing a filter or search term."
      />
    } @else if (view() === 'grid') {
      <ul class="tiles">
        @for (book of store.items(); track book.id) {
          <li class="tile">
            <a [routerLink]="[book.id]" class="tile-link">
              <app-book-cover
                decorative
                [src]="book.coverUrl"
                [title]="book.title"
                [width]="180"
                [height]="270"
              />
              <span class="title">{{ book.title }}</span>
            </a>
            @if (book.seriesId) {
              <p class="muted">
                <a [routerLink]="['/series', book.seriesId]" class="series-link">
                  {{ book.seriesName ?? 'Series' }}
                </a>
              </p>
            }
            @if (book.authors.length > 0) {
              <p class="muted">{{ authorNames(book) }}</p>
            }
          </li>
        }
      </ul>
    } @else {
      <ul class="rows">
        @for (book of store.items(); track book.id) {
          <li class="row">
            <a [routerLink]="[book.id]" class="row-link">
              <app-book-cover
                decorative
                [src]="book.coverUrl"
                [title]="book.title"
                [width]="32"
                [height]="48"
              />
              <span class="cell title-cell title">{{ book.title }}</span>
              @if (book.seriesId) {
                <span class="cell series-cell muted">{{ book.seriesName ?? 'Series' }}</span>
              }
              @if (book.authors.length > 0) {
                <span class="cell authors-cell muted">{{ authorNames(book) }}</span>
              }
              <span class="cell date-cell muted">
                {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
              </span>
            </a>
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
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .tiles,
    .rows {
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      gap: 1.25rem 1rem;
    }

    .tile-link {
      display: block;
      text-decoration: none;
    }

    /* Covers fill their column rather than sitting at their declared 180px, so
       tiles line up on a shared baseline whatever width auto-fill lands on. */
    .tile app-book-cover {
      width: 100%;
      margin-bottom: 0.5rem;
    }

    .rows {
      display: flex;
      flex-direction: column;
    }

    .row + .row {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    /* One line per book, spread across the full width: cover, title, series,
       authors, date. Fractional columns rather than fixed widths so the two
       long free-text fields absorb the slack instead of leaving a gutter.
       The date column is a fixed width on purpose — sized to its own content it
       would vary per row, and since each row is its own grid, "Release date
       unknown" and "4 June 2013" would hand their rows different free space and
       knock every column out of alignment with the row above. */
    .row-link {
      display: grid;
      grid-template-columns: auto minmax(0, 2.2fr) minmax(0, 1.4fr) minmax(0, 1.6fr) 10rem;
      align-items: center;
      gap: 0.25rem 1rem;
      padding: 0.375rem 0.5rem;
      border-radius: 8px;
      text-decoration: none;
    }

    .row-link:hover {
      background: var(--mat-sys-surface-container);
    }

    /* Each column truncates on its own rather than wrapping the row taller —
       a long title must not push every other row's rhythm out of alignment. */
    .cell {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Pinned rather than auto-placed: a book with no series or no credited
       author omits that cell entirely, and the rest must stay in column. */
    .title-cell {
      grid-column: 2;
    }

    .series-cell {
      grid-column: 3;
    }

    .authors-cell {
      grid-column: 4;
    }

    .date-cell {
      grid-column: 5;
      text-align: right;
    }

    /* Below this there is no horizontal room to columnise, so the row folds
       back into a stacked block with the cover alongside it. */
    @media (max-width: 48rem) {
      .row-link {
        grid-template-columns: auto minmax(0, 1fr);
        grid-auto-rows: auto;
        gap: 0 0.75rem;
        padding: 0.5rem;
      }

      .row-link .cell {
        grid-column: 2;
      }

      .row-link app-book-cover {
        grid-row: 1 / -1;
      }

      .date-cell {
        text-align: left;
      }
    }

    .title {
      display: block;
      font-weight: 600;
      color: var(--mat-sys-primary);
      text-decoration: underline;
    }

    .muted {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0.25rem 0 0;
    }

    .row-text .muted {
      margin: 0.125rem 0 0;
    }

    .series-link {
      color: inherit;
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

  protected readonly view = signal<ListView>(readStoredView());

  constructor() {
    effect(() => localStorage.setItem(VIEW_STORAGE_KEY, this.view()));
  }

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
