import { httpResource } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { formatReleaseDate, type BookSummary, type ListResponse } from '@books/domain';
import { createReleaseStore } from '../../core/release-store';
import { BookCover } from '../../shared/ui/book-cover';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
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
  imports: [
    RouterLink,
    PageHeader,
    AppCombobox,
    BookCover,
    PlanToggle,
    ResultCount,
    EmptyState,
    MatButtonModule,
    MatCheckboxModule,
  ],
  template: `
    <app-page-header title="Releases" />

    <div class="filters">
      <app-combobox
        placeholder="Filter by series"
        ariaLabel="Filter by series"
        [options]="seriesOptions()"
        [queryText]="seriesQuery()"
        (queryTextChange)="seriesQuery.set($event)"
        [value]="store.seriesId() || null"
        (valueChange)="store.seriesId.set($event ?? '')"
      />
      <mat-checkbox [checked]="store.mineOnly()" (change)="store.mineOnly.set($event.checked)">
        Only my planned releases
      </mat-checkbox>
    </div>

    <app-result-count [total]="totalCount()" noun="releases" />

    @if (totalCount() === 0 && !store.isLoading()) {
      <app-empty-state
        title="No releases in this window"
        hint="Try widening the window or clearing a filter."
      />
    } @else {
      @for (group of monthGroups(); track group.key) {
        <section class="group">
          <h2>{{ group.label }}</h2>
          <ul class="list">
            @for (book of group.books; track book.id) {
              <li class="row">
                <a [routerLink]="['/books', book.slug]" class="row-main">
                  <app-book-cover
                    decorative
                    [src]="book.coverUrl"
                    [title]="book.title"
                    [width]="32"
                    [height]="48"
                  />
                  <span class="row-text">
                    <span class="title">{{ book.title }}</span>
                    @if (book.seriesId) {
                      <span class="muted">
                        {{ book.seriesName ?? 'Series' }}
                        @if (book.seriesPosition) {
                          — #{{ book.seriesPosition }}
                        }
                      </span>
                    }
                    <span class="muted">
                      {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
                    </span>
                  </span>
                </a>
                <div class="row-actions">
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
        <section class="group">
          <h2>TBA</h2>
          @for (group of yearGroups(); track group.year) {
            <h3>{{ group.year }} (month TBA)</h3>
            <ul class="list">
              @for (book of group.books; track book.id) {
                <li class="row">
                  <a [routerLink]="['/books', book.slug]" class="row-main">
                    <app-book-cover
                      decorative
                      [src]="book.coverUrl"
                      [title]="book.title"
                      [width]="32"
                      [height]="48"
                    />
                    <span class="row-text">
                      <span class="title">{{ book.title }}</span>
                      @if (book.seriesId) {
                        <span class="muted">{{ book.seriesName ?? 'Series' }}</span>
                      }
                    </span>
                  </a>
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
        <section class="group">
          <h2>Undated</h2>
          <ul class="list">
            @for (book of store.releases().undated; track book.id) {
              <li class="row">
                <a [routerLink]="['/books', book.slug]" class="row-main">
                  <app-book-cover
                    decorative
                    [src]="book.coverUrl"
                    [title]="book.title"
                    [width]="32"
                    [height]="48"
                  />
                  <span class="row-text">
                    <span class="title">{{ book.title }}</span>
                    @if (book.seriesId) {
                      <span class="muted">{{ book.seriesName ?? 'Series' }}</span>
                    }
                  </span>
                </a>
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

    <div class="show-more">
      <button mat-stroked-button type="button" (click)="showMore()">Show next 12 months</button>
    </div>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .group {
      margin-top: 1.5rem;
    }

    h2 {
      font: var(--mat-sys-title-large);
      margin: 0;
    }

    h3 {
      font: var(--mat-sys-title-medium);
      margin: 0.75rem 0 0;
    }

    .list {
      margin: 0.5rem 0 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    /* Cover and text are one link, with the plan controls left outside it —
       nesting a button inside an anchor is invalid, and the toggle needs its
       own name and press state regardless. */
    .row-main {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
      text-decoration: none;
    }

    .row-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .title {
      font-weight: 600;
      color: var(--mat-sys-primary);
      text-decoration: underline;
    }

    .muted {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .row-text .muted {
      margin-top: 0.125rem;
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .show-more {
      margin-top: 1.5rem;
      text-align: center;
    }
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
