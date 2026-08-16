import { httpResource } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatReleaseDate, type BookSummary, type ListResponse } from '@books/domain';
import { createReleaseStore } from '../../core/release-store';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { Chip } from '../../shared/ui/chip';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';
import { PlanToggle } from '../../shared/ui/plan-toggle';
import { ResultCount } from '../../shared/ui/result-count';

const MONTHS_PER_STEP = 12;

interface MonthGroup {
  readonly key: string;
  readonly label: string;
  readonly books: BookSummary[];
}

interface YearGroup {
  readonly year: string;
  readonly books: BookSummary[];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1 + months, d);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function monthLabelFor(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * Deliberately not an `app-list-toolbar`/`createListStore` consumer:
 * `ReleaseListQuery` has no `q` or `sort` field, so the shared toolbar's
 * unconditional search box doesn't fit this resource — see the Phase 7 plan.
 */
@Component({
  selector: 'app-releases-page',
  imports: [RouterLink, PageHeader, AppCombobox, Chip, PlanToggle, ResultCount, EmptyState],
  template: `
    <app-page-header title="Releases" />

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <app-combobox
        placeholder="Filter by series"
        ariaLabel="Filter by series"
        [options]="seriesOptions()"
        [queryText]="seriesQuery()"
        (queryTextChange)="seriesQuery.set($event)"
        [value]="store.seriesId() || null"
        (valueChange)="store.seriesId.set($event ?? '')"
      />
      <label class="flex items-center gap-2 text-sm">
        <input
          #mineOnlyInput
          type="checkbox"
          [checked]="store.mineOnly()"
          (change)="store.mineOnly.set(mineOnlyInput.checked)"
        />
        Only my planned releases
      </label>
    </div>

    <app-result-count [total]="totalCount()" noun="releases" />

    @if (totalCount() === 0 && !store.isLoading()) {
      <app-empty-state
        title="No releases in this window"
        hint="Try widening the window or clearing a filter."
      />
    } @else {
      @for (group of monthGroups(); track group.key) {
        <section class="mt-6">
          <h2 class="text-lg font-semibold">{{ group.label }}</h2>
          <ul class="mt-2 divide-y divide-border">
            @for (book of group.books; track book.id) {
              <li class="flex items-center justify-between gap-3 py-2">
                <div>
                  <a [routerLink]="['/books', book.id]" class="font-medium underline">{{
                    book.title
                  }}</a>
                  @if (book.seriesId) {
                    <p class="text-sm text-ink-muted">
                      {{ seriesNames().get(book.seriesId) ?? 'Series' }}
                      @if (book.seriesPosition) {
                        — #{{ book.seriesPosition }}
                      }
                    </p>
                  }
                  <p class="text-sm text-ink-muted">
                    {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  @if (store.plannedIds().has(book.id)) {
                    <app-chip label="plan" tone="plan" />
                  }
                  <app-plan-toggle
                    [title]="book.title"
                    [pressed]="store.plannedIds().has(book.id)"
                    (planToggled)="store.togglePlan(book)"
                  />
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (yearGroups().length > 0) {
        <section class="mt-6">
          <h2 class="text-lg font-semibold">TBA</h2>
          @for (group of yearGroups(); track group.year) {
            <h3 class="mt-3 font-medium">{{ group.year }} (month TBA)</h3>
            <ul class="mt-2 divide-y divide-border">
              @for (book of group.books; track book.id) {
                <li class="flex items-center justify-between gap-3 py-2">
                  <a [routerLink]="['/books', book.id]" class="font-medium underline">{{
                    book.title
                  }}</a>
                  <app-plan-toggle
                    [title]="book.title"
                    [pressed]="store.plannedIds().has(book.id)"
                    (planToggled)="store.togglePlan(book)"
                  />
                </li>
              }
            </ul>
          }
        </section>
      }

      @if (store.releases().undated.length > 0) {
        <section class="mt-6">
          <h2 class="text-lg font-semibold">Undated</h2>
          <ul class="mt-2 divide-y divide-border">
            @for (book of store.releases().undated; track book.id) {
              <li class="flex items-center justify-between gap-3 py-2">
                <a [routerLink]="['/books', book.id]" class="font-medium underline">{{
                  book.title
                }}</a>
                <app-plan-toggle
                  [title]="book.title"
                  [pressed]="store.plannedIds().has(book.id)"
                  (planToggled)="store.togglePlan(book)"
                />
              </li>
            }
          </ul>
        </section>
      }
    }

    <div class="mt-6 text-center">
      <button
        type="button"
        class="rounded-sm border border-border px-3 py-1.5 text-sm"
        (click)="showMore()"
      >
        Show next 12 months
      </button>
    </div>
  `,
})
export class ReleasesPage {
  protected readonly formatReleaseDate = formatReleaseDate;

  private readonly today = todayIsoLocal();
  protected readonly monthsAhead = signal(MONTHS_PER_STEP);

  private readonly window = computed(() => ({
    from: this.today,
    to: addMonthsIso(this.today, this.monthsAhead()),
  }));

  protected readonly store = createReleaseStore(this.window);

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

  private readonly allSeriesResource = httpResource<ListResponse<{ id: string; name: string }>>(
    () => ({ url: '/api/v1/series', params: { pageSize: 100 } }),
    { defaultValue: { items: [], page: 1, pageSize: 100, total: 0 } },
  );
  protected readonly seriesNames = computed<ReadonlyMap<string, string>>(
    () =>
      new Map(
        (this.allSeriesResource.hasValue() ? this.allSeriesResource.value().items : []).map((s) => [
          s.id,
          s.name,
        ]),
      ),
  );

  protected readonly monthGroups = computed<MonthGroup[]>(() => {
    const groups = new Map<string, BookSummary[]>();
    for (const book of [...this.store.releases().dated, ...this.store.releases().monthly]) {
      const key = book.releaseDate?.slice(0, 7);
      if (!key) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(book);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, books]) => ({
        key,
        label: monthLabelFor(key),
        books: books.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '')),
      }));
  });

  protected readonly yearGroups = computed<YearGroup[]>(() => {
    const groups = new Map<string, BookSummary[]>();
    for (const book of this.store.releases().yearly) {
      const key = book.releaseDate?.slice(0, 4);
      if (!key) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(book);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, books]) => ({ year, books }));
  });

  protected readonly totalCount = computed(
    () =>
      this.store.releases().dated.length +
      this.store.releases().monthly.length +
      this.store.releases().yearly.length +
      this.store.releases().undated.length,
  );

  protected showMore(): void {
    this.monthsAhead.update((n) => n + MONTHS_PER_STEP);
  }
}
