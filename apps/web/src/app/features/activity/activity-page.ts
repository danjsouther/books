import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ACTIVITY_KINDS,
  type ActivityFeed,
  type ActivityItem,
  type ActivityKind,
  type ListResponse,
} from '@books/domain';
import { formatRelativeTime } from '../../shared/format-relative-time';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { AppSelect, type SelectOption } from '../../shared/ui/select';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';

const KIND_LABELS: Record<ActivityKind, string> = {
  'book.added': 'Added',
  'status.changed': 'Status changed',
  'rating.changed': 'Rating changed',
  'shelf.removed': 'Removed from shelf',
  'book.released': 'Released',
};
const KIND_OPTIONS: readonly SelectOption[] = ACTIVITY_KINDS.map((k) => ({
  id: k,
  label: KIND_LABELS[k],
}));

/**
 * Cursor-paged with a "Load more" button, never infinite scroll — the master
 * plan is explicit that infinite scroll steals the footer and denies
 * keyboard users any way to reach the end of the page. Built on plain
 * `HttpClient` calls rather than `httpResource`, since the behavior this page
 * needs — append a page onto an accumulating list on demand, reset and
 * reload from scratch on a filter change — is fundamentally imperative, and
 * forcing `httpResource` + an `effect()` to do accumulation is exactly the
 * class of bug the calendar's focus-stealing effect (Phase 7) already
 * demonstrated is easy to get wrong.
 *
 * Deliberately no `aria-live` around the list: this is a browsed archive, not
 * a live feed, and announcing every row as it renders would be hostile.
 */
@Component({
  selector: 'app-activity-page',
  imports: [RouterLink, PageHeader, AppSelect, AppCombobox, EmptyState, Skeleton],
  template: `
    <app-page-header title="Activity" />

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <app-select
        ariaLabel="Filter by kind"
        [options]="kindOptions"
        [value]="kind() || null"
        (valueChange)="kind.set($event ?? '')"
      />
      <app-combobox
        placeholder="Filter by member"
        ariaLabel="Filter by member"
        [options]="actorOptions()"
        [queryText]="actorQuery()"
        (queryTextChange)="actorQuery.set($event)"
        [value]="actorId() || null"
        (valueChange)="actorId.set($event ?? '')"
      />
    </div>

    @if (isLoading() && items().length === 0) {
      <app-skeleton />
    } @else if (items().length === 0) {
      <app-empty-state title="No activity yet" />
    } @else {
      <ul class="divide-y divide-border">
        @for (item of items(); track item.id) {
          <li class="py-3 text-sm">
            <time
              [attr.datetime]="item.createdAt"
              [attr.title]="item.createdAt"
              class="text-ink-muted"
            >
              {{ relativeTime(item.createdAt) }}
            </time>
            —
            @switch (item.kind) {
              @case ('book.added') {
                <strong>{{ item.actor?.username }}</strong> <strong>added</strong>
                @if (item.book) {
                  <a [routerLink]="['/books', item.book.id]" class="underline">{{
                    item.book.title
                  }}</a>
                }
              }
              @case ('status.changed') {
                <strong>{{ item.actor?.username }}</strong> <strong>marked</strong>
                @if (item.book) {
                  <a [routerLink]="['/books', item.book.id]" class="underline">{{
                    item.book.title
                  }}</a>
                }
                as <strong>{{ toValue(item) }}</strong>
                @if (fromValue(item) !== null) {
                  <span class="text-ink-muted">(was {{ fromValue(item) }})</span>
                }
              }
              @case ('rating.changed') {
                <strong>{{ item.actor?.username }}</strong>
                @if (toValue(item) === null) {
                  <strong>cleared their rating</strong> for
                } @else {
                  <strong>rated</strong>
                }
                @if (item.book) {
                  <a [routerLink]="['/books', item.book.id]" class="underline">{{
                    item.book.title
                  }}</a>
                }
                @if (toValue(item) !== null) {
                  <strong>{{ toValue(item) }}/10</strong>
                }
                @if (fromValue(item) !== null) {
                  <span class="text-ink-muted">(was {{ fromValue(item) }})</span>
                }
              }
              @case ('shelf.removed') {
                <strong>{{ item.actor?.username }}</strong> <strong>removed</strong>
                @if (item.book) {
                  <a [routerLink]="['/books', item.book.id]" class="underline">{{
                    item.book.title
                  }}</a>
                }
                from their shelf
              }
              @case ('book.released') {
                📕
                @if (item.book) {
                  <strong
                    ><a [routerLink]="['/books', item.book.id]" class="underline">{{
                      item.book.title
                    }}</a></strong
                  >
                }
                <strong>is out today</strong>
              }
              @default {}
            }
          </li>
        }
      </ul>

      @if (nextCursor() !== null) {
        <div class="mt-6 text-center">
          <button
            type="button"
            class="rounded-sm border border-border px-3 py-1.5 text-sm"
            [disabled]="isLoading()"
            (click)="loadMore()"
          >
            Load more
          </button>
        </div>
      }
    }
  `,
})
export class ActivityPage {
  private readonly http = inject(HttpClient);

  protected readonly kindOptions = KIND_OPTIONS;
  protected readonly kind = signal('');

  protected readonly actorQuery = signal('');
  protected readonly actorId = signal('');
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

  protected readonly items = signal<ActivityItem[]>([]);
  protected readonly nextCursor = signal<number | null>(null);
  protected readonly isLoading = signal(false);

  constructor() {
    effect(() => {
      // Tracks only the filters — a genuine filter change resets paging and
      // reloads from scratch, mirroring `createListStore`'s rule even though
      // this page isn't built on it.
      this.kind();
      this.actorId();
      untracked(() => {
        this.items.set([]);
        this.nextCursor.set(null);
        this.fetchPage(null);
      });
    });
  }

  protected loadMore(): void {
    if (this.nextCursor() !== null) this.fetchPage(this.nextCursor());
  }

  private fetchPage(before: number | null): void {
    this.isLoading.set(true);
    const params: Record<string, string> = {};
    if (this.kind()) params['kind'] = this.kind();
    if (this.actorId()) params['actorId'] = this.actorId();
    if (before !== null) params['before'] = String(before);
    this.http.get<ActivityFeed>('/api/v1/activity', { params }).subscribe({
      next: (feed) => {
        this.items.update((prev) => [...prev, ...feed.items]);
        this.nextCursor.set(feed.nextCursor);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected relativeTime(iso: string): string {
    return formatRelativeTime(iso, Date.now());
  }

  protected fromValue(item: ActivityItem): unknown {
    return (item.payload as { from?: unknown }).from ?? null;
  }

  protected toValue(item: ActivityItem): unknown {
    return (item.payload as { to?: unknown }).to ?? null;
  }
}
