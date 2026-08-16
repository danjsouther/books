import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CHANGE_KINDS, type ChangeItem, type ListResponse } from '@books/domain';
import { createListStore } from '../../core/list-store';
import { Flash } from '../../core/flash';
import { BooksApi } from '../books/books-api';
import { SeriesApi } from '../series/series-api';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { AppSelect, type SelectOption } from '../../shared/ui/select';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { ResultCount } from '../../shared/ui/result-count';
import { Skeleton } from '../../shared/ui/skeleton';
import { collapseChanges, type CollapsedChange } from './collapse-changes';

interface ChangeFilters extends Record<string, unknown> {
  readonly entityType: string;
  readonly changeKind: string;
  readonly actorId: string;
}

const ENTITY_TYPE_OPTIONS: readonly SelectOption[] = [
  { id: 'book', label: 'Book' },
  { id: 'series', label: 'Series' },
];
const CHANGE_KIND_OPTIONS: readonly SelectOption[] = CHANGE_KINDS.map((k) => ({ id: k, label: k }));

/**
 * Genuinely offset-paged (`ChangeListQuery` extends `ListQuerySchema`), so
 * unlike `ActivityPage` this does use `createListStore` — but still not
 * `app-list-toolbar`, for the same "no `q` field on this query schema"
 * reason `ReleasesPage` already established in Phase 7.
 */
@Component({
  selector: 'app-changes-page',
  imports: [
    RouterLink,
    PageHeader,
    AppSelect,
    AppCombobox,
    ResultCount,
    Skeleton,
    EmptyState,
    Pagination,
  ],
  template: `
    <app-page-header title="Changes" />

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <app-select
        ariaLabel="Filter by entity type"
        [options]="entityTypeOptions"
        [value]="store.filters().entityType || null"
        (valueChange)="store.setFilter('entityType', $event ?? '')"
      />
      <app-select
        ariaLabel="Filter by change kind"
        [options]="changeKindOptions"
        [value]="store.filters().changeKind || null"
        (valueChange)="store.setFilter('changeKind', $event ?? '')"
      />
      <app-combobox
        placeholder="Filter by member"
        ariaLabel="Filter by member"
        [options]="actorOptions()"
        [queryText]="actorQuery()"
        (queryTextChange)="actorQuery.set($event)"
        [value]="store.filters().actorId || null"
        (valueChange)="store.setFilter('actorId', $event ?? '')"
      />
    </div>

    <app-result-count [total]="store.total()" noun="changes" />

    @if (store.isLoading() && store.items().length === 0) {
      <app-skeleton />
    } @else if (store.items().length === 0) {
      <app-empty-state title="No changes match your filters" />
    } @else {
      <ul class="mt-4 divide-y divide-border">
        @for (row of displayRows(); track row.entityType + row.entityId + row.version) {
          <li class="py-3 text-sm">
            <a [routerLink]="entityLink(row)" class="font-medium underline">{{ row.title }}</a>
            @switch (row.changeKind) {
              @case ('created') {
                — <strong>created</strong> → v{{ row.version }}
              }
              @case ('edited') {
                @if (row.count > 1) {
                  — <strong>edited</strong> {{ row.count }} times →
                  <strong>v{{ row.version }}</strong>
                } @else {
                  — <strong>edited</strong> — <em>{{ row.changedFields.join(', ') }}</em> changed →
                  <strong>v{{ row.version }}</strong>
                }
              }
              @case ('deleted') {
                — <strong>deleted</strong> ({{ row.entityType }})
              }
              @case ('restored') {
                — <strong>restored</strong> ({{ row.entityType }})
              }
              @case ('reverted') {
                — <strong>reverted</strong> → <strong>v{{ row.version }}</strong>
              }
              @default {}
            }
            <span class="ml-2">
              <a [routerLink]="historyLink(row)" class="underline">View diff</a>
              @if (row.changeKind !== 'created') {
                ·
                <button type="button" class="underline" (click)="revert(row)">Revert</button>
              }
            </span>
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
export class ChangesPage {
  private readonly booksApi = inject(BooksApi);
  private readonly seriesApi = inject(SeriesApi);
  private readonly flash = inject(Flash);

  protected readonly store = createListStore<ChangeItem, ChangeFilters>('/api/v1/changes', {
    entityType: '',
    changeKind: '',
    actorId: '',
  });

  protected readonly entityTypeOptions = ENTITY_TYPE_OPTIONS;
  protected readonly changeKindOptions = CHANGE_KIND_OPTIONS;

  protected readonly actorQuery = signal('');
  private readonly actorResource = httpResource<ListResponse<{ id: string; username: string }>>(
    () => ({ url: '/api/v1/users', params: { q: this.actorQuery(), pageSize: 10 } }),
    { defaultValue: { items: [], page: 1, pageSize: 10, total: 0 } },
  );
  protected readonly actorOptions = computed<ComboboxOption[]>(() =>
    (this.actorResource.hasValue() ? this.actorResource.value().items : []).map((u) => ({
      id: u.id,
      label: u.username,
    })),
  );

  protected readonly displayRows = computed<CollapsedChange[]>(() =>
    collapseChanges(this.store.items()),
  );

  protected entityLink(row: ChangeItem): string[] {
    return row.entityType === 'book' ? ['/books', row.entityId] : ['/series', row.entityId];
  }

  protected historyLink(row: ChangeItem): string[] {
    return row.entityType === 'book'
      ? ['/books', row.entityId, 'history']
      : ['/series', row.entityId, 'history'];
  }

  protected revert(row: CollapsedChange): void {
    const onSuccess = (): void => {
      this.flash.show(`Reverted "${row.title}".`);
      this.store.reload();
    };
    const onError = (): void => {
      this.flash.show('Could not revert this change — please try again.');
    };

    if (row.entityType === 'book') {
      this.booksApi.revert(row.entityId, row.oldestVersion).subscribe({
        next: onSuccess,
        error: onError,
      });
    } else {
      this.seriesApi.revert(row.entityId, row.oldestVersion).subscribe({
        next: onSuccess,
        error: onError,
      });
    }
  }
}
