import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TrashItem } from '@books/domain';
import { BooksApi } from '../books/books-api';
import { createListStore } from '../../core/list-store';
import { Flash } from '../../core/flash';
import { EmptyState } from '../../shared/ui/empty-state';
import { ListToolbar, type SortOption } from '../../shared/ui/list-toolbar';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { ResultCount } from '../../shared/ui/result-count';
import { Skeleton } from '../../shared/ui/skeleton';
import { SeriesApi } from '../series/series-api';

interface TrashFilters extends Record<string, unknown> {
  readonly q: string;
  readonly type: string;
  readonly sort: string;
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'deletedAt', label: 'Recently deleted' },
  { value: 'title', label: 'Title' },
];

@Component({
  selector: 'app-trash-page',
  imports: [RouterLink, PageHeader, ListToolbar, ResultCount, Skeleton, EmptyState, Pagination],
  template: `
    <app-page-header title="Trash" />

    <app-list-toolbar
      searchLabel="Search trash"
      [query]="store.filters().q"
      (queryChange)="store.setFilter('q', $event)"
      [sortOptions]="sortOptions"
      [sortValue]="store.filters().sort"
      (sortValueChange)="store.setFilter('sort', $event)"
    />

    <app-result-count [total]="store.total()" noun="items" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state title="Nothing in the trash" />
    } @else {
      <ul class="mt-4 divide-y divide-border">
        @for (item of store.items(); track item.type + item.id) {
          <li class="flex items-center justify-between py-3">
            <div>
              <a
                [routerLink]="[item.type === 'book' ? '/books' : '/series', item.id]"
                class="underline"
              >
                {{ item.title }}
              </a>
              <p class="text-sm text-ink-muted">{{ item.type }} · deleted {{ item.deletedAt }}</p>
            </div>
            <button
              type="button"
              class="rounded-sm border border-border px-3 py-1.5 text-sm"
              (click)="restore(item)"
            >
              Restore
            </button>
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
export class TrashPage {
  private readonly booksApi = inject(BooksApi);
  private readonly seriesApi = inject(SeriesApi);
  private readonly flash = inject(Flash);

  protected readonly store = createListStore<TrashItem, TrashFilters>('/api/v1/trash', {
    q: '',
    type: '',
    sort: 'deletedAt',
  });

  protected readonly sortOptions = SORT_OPTIONS;

  protected restore(item: TrashItem): void {
    const onSuccess = (): void => {
      this.flash.show(`"${item.title}" restored.`);
      this.store.reload();
    };
    const onError = (err: { status?: number }): void => {
      this.flash.show(
        err.status === 409
          ? `Could not restore "${item.title}" — something already uses its identifier.`
          : `Could not restore "${item.title}" — please try again.`,
      );
    };

    if (item.type === 'book') {
      this.booksApi.restore(item.id).subscribe({ next: onSuccess, error: onError });
    } else {
      this.seriesApi.restore(item.id).subscribe({ next: onSuccess, error: onError });
    }
  }
}
