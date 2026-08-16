import { Grid, GridCell, GridCellWidget, GridRow } from '@angular/aria/grid';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
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
  imports: [RouterLink, Grid, GridRow, GridCell, GridCellWidget, AppCombobox, PlanToggle],
  host: {
    '(keydown.pageup)': 'navigateMonths(-1)',
    '(keydown.pagedown)': 'navigateMonths(1)',
    '(keydown.shift.pageup)': 'navigateMonths(-12)',
    '(keydown.shift.pagedown)': 'navigateMonths(12)',
    '(keydown.control.home)': 'goToToday()',
  },
  template: `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ monthLabel() }}</h1>
      <nav aria-label="Month navigation" class="flex items-center gap-2 text-sm">
        <a [routerLink]="prevMonthLink()" class="rounded-sm border border-border px-3 py-1.5">
          Previous
        </a>
        <a [routerLink]="todayLink()" class="rounded-sm border border-border px-3 py-1.5">
          Today
        </a>
        <a [routerLink]="nextMonthLink()" class="rounded-sm border border-border px-3 py-1.5">
          Next
        </a>
      </nav>
    </div>

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
          (change)="setMineOnly(mineOnlyInput.checked)"
        />
        Only my planned releases
      </label>
    </div>

    <table
      ngGrid
      focusMode="roving"
      rowWrap="nowrap"
      colWrap="nowrap"
      class="w-full border-collapse text-sm"
    >
      <caption class="sr-only">
        Book releases,
        {{
          monthLabel()
        }}. Use arrow keys to move between days.
      </caption>
      <tr ngGridRow>
        @for (label of weekdayLabels; track label) {
          <th
            ngGridCell
            role="columnheader"
            scope="col"
            class="border border-border p-2 text-left font-medium"
          >
            {{ label }}
          </th>
        }
      </tr>
      @for (week of monthGrid(); track $index) {
        <tr ngGridRow>
          @for (cell of week; track cell.iso) {
            <td
              ngGridCell
              [id]="'cell-' + cell.iso"
              [attr.aria-current]="cell.isToday ? 'date' : null"
              [attr.aria-label]="cellLabel(cell)"
              (focus)="focusedDay.set(cell.day)"
              class="h-24 min-w-28 border border-border p-1 align-top"
              [class.bg-surface-sunken]="!cell.inMonth"
            >
              <span aria-hidden="true" class="text-xs" [class.text-ink-muted]="!cell.inMonth">
                {{ cell.day }}
              </span>
              @if (releasesByDate()[cell.iso]?.length) {
                <div ngGridCellWidget widgetType="complex" class="mt-1 space-y-1">
                  @for (r of releasesByDate()[cell.iso]; track r.id) {
                    <div class="text-xs">
                      <a [routerLink]="['/books', r.id]" class="underline">{{ r.title }}</a>
                      <app-plan-toggle
                        [title]="r.title"
                        [pressed]="store.plannedIds().has(r.id)"
                        (planToggled)="store.togglePlan(r)"
                      />
                    </div>
                  }
                </div>
              }
            </td>
          }
        </tr>
      }
    </table>

    @if (monthlyReleases().length > 0) {
      <section class="mt-6 border-t border-border pt-4">
        <h3 class="font-medium">Also in {{ monthLabel() }} (exact day unknown)</h3>
        <ul class="mt-2 space-y-1 text-sm">
          @for (r of monthlyReleases(); track r.id) {
            <li>
              <a [routerLink]="['/books', r.id]" class="underline">{{ r.title }}</a>
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

    <p aria-live="polite" aria-atomic="true" class="sr-only">{{ liveRegionText() }}</p>
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

  protected readonly focusedDay = signal(1);
  protected readonly liveRegionText = signal('');

  private hasMounted = false;

  constructor() {
    this.mineOnlyFromQueryParams();

    effect(() => {
      // Tracks only the grid/month — never `store.releases()`, which resolves
      // asynchronously well after mount and must not be mistaken for a month
      // change that steals focus once the data happens to arrive.
      const grid = this.monthGrid();
      const label = this.monthLabel();
      const focusedDay = this.focusedDay();

      if (!this.hasMounted) {
        this.hasMounted = true;
        return;
      }

      const targetDay = Math.min(focusedDay, daysInMonth(this.numericYear(), this.numericMonth()));
      const targetIso = grid.flat().find((c) => c.inMonth && c.day === targetDay)?.iso;
      if (targetIso) {
        queueMicrotask(() => {
          document.getElementById(`cell-${targetIso}`)?.focus();
        });
      }
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
