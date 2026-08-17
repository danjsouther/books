import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  buildMonthGrid,
  formatReleaseDate,
  type BookSummary,
  type DayCell,
  type ListResponse,
} from '@books/domain';
import { createReleaseStore } from '../../core/release-store';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { PlanToggle } from '../../shared/ui/plan-toggle';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Reads the real, local "now" once — a legitimate read of the actual clock
 *  (what month is it right now for this viewer), not the ISO-string-parsing
 *  footgun `formatReleaseDate` guards against. Kept isolated here rather than
 *  scattered through the component. */
function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthLabelFor(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

@Component({
  selector: 'app-calendar-page',
  imports: [RouterLink, AppCombobox, PlanToggle, MatButtonModule, MatCheckboxModule],
  host: {
    '(keydown.pageup)': 'navigateMonths(-1)',
    '(keydown.pagedown)': 'navigateMonths(1)',
    '(keydown.shift.pageup)': 'navigateMonths(-12)',
    '(keydown.shift.pagedown)': 'navigateMonths(12)',
    '(keydown.control.home)': 'goToToday()',
  },
  template: `
    <div class="header">
      <h1>{{ monthLabel() }}</h1>
      <nav aria-label="Month navigation" class="month-nav">
        <a mat-stroked-button [routerLink]="prevMonthLink()">Previous</a>
        <a mat-stroked-button [routerLink]="todayLink()">Today</a>
        <a mat-stroked-button [routerLink]="nextMonthLink()">Next</a>
      </nav>
    </div>

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
      <mat-checkbox [checked]="store.mineOnly()" (change)="setMineOnly($event.checked)">
        Only my planned releases
      </mat-checkbox>
    </div>

    <div class="calendar" role="table" [attr.aria-label]="'Book releases, ' + monthLabel()">
      <div class="weekday-row" role="row">
        @for (label of weekdayLabels; track label) {
          <div class="weekday" role="columnheader">{{ label }}</div>
        }
      </div>
      @for (week of monthGrid(); track $index) {
        <div class="week-row" role="row">
          @for (cell of week; track cell.iso) {
            <div
              class="day-cell"
              role="cell"
              [id]="'cell-' + cell.iso"
              [class.out-of-month]="!cell.inMonth"
              [attr.aria-current]="cell.isToday ? 'date' : null"
              [attr.aria-label]="cellLabel(cell)"
            >
              <span class="day-number" aria-hidden="true">{{ cell.day }}</span>
              @if (releasesByDate()[cell.iso]?.length) {
                <div class="releases">
                  @for (r of releasesByDate()[cell.iso]; track r.id) {
                    <div class="release">
                      <a [routerLink]="['/books', r.id]">{{ r.title }}</a>
                      <app-plan-toggle
                        [title]="r.title"
                        [pressed]="store.plannedIds().has(r.id)"
                        (planToggled)="store.togglePlan(r)"
                      />
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (monthlyReleases().length > 0) {
      <section class="monthly-section">
        <h3>Also in {{ monthLabel() }} (exact day unknown)</h3>
        <ul class="monthly-list">
          @for (r of monthlyReleases(); track r.id) {
            <li>
              <a [routerLink]="['/books', r.id]">{{ r.title }}</a>
              <app-plan-toggle
                [title]="r.title"
                [pressed]="store.plannedIds().has(r.id)"
                (planToggled)="store.togglePlan(r)"
              />
            </li>
          }
        </ul>
      </section>
    }

    <p aria-live="polite" aria-atomic="true" class="cdk-visually-hidden">{{ liveRegionText() }}</p>
  `,
  styles: `
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .month-nav {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .calendar {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);
    }

    .weekday-row,
    .week-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }

    .weekday {
      padding: 0.5rem;
      font-weight: 600;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .day-cell {
      min-height: 6rem;
      min-width: 7rem;
      padding: 0.25rem;
      border: 1px solid var(--mat-sys-outline-variant);
      vertical-align: top;
    }

    .day-cell.out-of-month {
      background: var(--mat-sys-surface-container-low);
    }

    .day-cell.out-of-month .day-number {
      color: var(--mat-sys-on-surface-variant);
    }

    .day-number {
      font-size: 0.75rem;
    }

    .releases {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.25rem;
    }

    .release {
      font-size: 0.75rem;
    }

    .monthly-section {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .monthly-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.5rem;
      padding: 0;
      list-style: none;
      font-size: 0.875rem;
    }
  `,
})
export class CalendarPage {
  readonly year = input.required<string>();
  readonly month = input.required<string>();

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly weekdayLabels = WEEKDAY_LABELS;

  private readonly numericYear = computed(() => Number(this.year()));
  private readonly numericMonth = computed(() => Number(this.month()));

  private readonly todayIso = todayIsoLocal();

  protected readonly monthGrid = computed<DayCell[][]>(() =>
    buildMonthGrid(this.numericYear(), this.numericMonth(), this.todayIso),
  );

  protected readonly monthLabel = computed(() =>
    monthLabelFor(this.numericYear(), this.numericMonth()),
  );

  private readonly window = computed(() => {
    const grid = this.monthGrid();
    return { from: grid[0]![0]!.iso, to: grid[5]![6]!.iso };
  });

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

  protected readonly releasesByDate = computed<Record<string, BookSummary[]>>(() => {
    const byDate: Record<string, BookSummary[]> = {};
    for (const book of this.store.releases().dated) {
      if (book.releaseDate === null) continue;
      (byDate[book.releaseDate] ??= []).push(book);
    }
    return byDate;
  });

  protected readonly monthlyReleases = computed<BookSummary[]>(() => {
    const key = `${String(this.numericYear())}-${pad2(this.numericMonth())}`;
    return this.store.releases().monthly.filter((b) => b.releaseDate?.startsWith(key));
  });

  protected readonly prevMonthLink = computed(() => this.monthLink(-1));
  protected readonly nextMonthLink = computed(() => this.monthLink(1));
  protected readonly todayLink = computed(() => {
    const [y, m] = this.todayIso.split('-');
    return ['/calendar', y, String(Number(m))];
  });

  protected readonly liveRegionText = signal('');

  constructor() {
    this.mineOnlyFromQueryParams();

    effect(() => {
      const label = this.monthLabel();
      const releaseCount = untracked(
        () => this.store.releases().dated.length + this.store.releases().monthly.length,
      );
      this.liveRegionText.set(`${label}, ${String(releaseCount)} releases`);
    });
  }

  private mineOnlyFromQueryParams(): void {
    this.store.mineOnly.set(this.route.snapshot.queryParamMap.get('mine') === '1');
  }

  protected setMineOnly(checked: boolean): void {
    this.store.mineOnly.set(checked);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mine: checked ? '1' : null },
      queryParamsHandling: 'merge',
    });
  }

  protected cellLabel(cell: DayCell): string {
    const dateLabel = formatReleaseDate(cell.iso, 'day');
    const items = this.releasesByDate()[cell.iso] ?? [];
    if (items.length === 0) return `${dateLabel}, no releases`;
    const noun = items.length === 1 ? 'release' : 'releases';
    return `${dateLabel}, ${String(items.length)} ${noun}: ${items.map((b) => b.title).join(', ')}`;
  }

  protected navigateMonths(delta: number): void {
    void this.router.navigate(this.monthLink(delta));
  }

  protected goToToday(): void {
    void this.router.navigate(this.todayLink());
  }

  private monthLink(delta: number): string[] {
    let y = this.numericYear();
    let m = this.numericMonth() + delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    return ['/calendar', String(y), String(m)];
  }
}
