import { httpResource } from '@angular/common/http';
import { computed, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import type { BookSummary, ReleasesResponse } from '@books/domain';
import { Flash } from './flash';
import { ShelfApi } from '../features/books/shelf-api';

export interface ReleaseWindow {
  readonly from: string;
  readonly to: string;
}

const EMPTY_RELEASES: ReleasesResponse = {
  dated: [],
  monthly: [],
  yearly: [],
  undated: [],
  window: { from: '', to: '' },
};

function allBooks(response: ReleasesResponse): BookSummary[] {
  return [...response.dated, ...response.monthly, ...response.yearly, ...response.undated];
}

export interface ReleaseStore {
  readonly releases: Signal<ReleasesResponse>;
  readonly isLoading: Signal<boolean>;
  /** Book IDs the viewer has marked `plan`, independent of `mineOnly` — see
   *  the Phase 7 plan note on why this is a second, always-`mine:true`
   *  request rather than new API surface. */
  readonly plannedIds: Signal<ReadonlySet<string>>;
  readonly seriesId: WritableSignal<string>;
  readonly mineOnly: WritableSignal<boolean>;
  togglePlan(book: BookSummary): void;
}

/**
 * Shared by the calendar and the release list — both consume the same
 * `GET /api/v1/releases` window, pre-bucketed by precision server-side. Built
 * around a date window rather than offset paging, since releases aren't paged
 * by page number.
 *
 * Must be called from an injection context (a component field initializer or
 * constructor) — it uses `inject(ShelfApi)`/`inject(Flash)` internally, the
 * same constraint `createListStore` documents.
 */
export function createReleaseStore(window: Signal<ReleaseWindow>): ReleaseStore {
  const shelfApi = inject(ShelfApi);
  const flash = inject(Flash);

  const seriesId = signal('');
  const mineOnly = signal(false);

  const mainResource = httpResource<ReleasesResponse>(
    () => ({
      url: '/api/v1/releases',
      params: {
        from: window().from,
        to: window().to,
        includeUndated: true,
        mine: mineOnly(),
        ...(seriesId() ? { seriesId: seriesId() } : {}),
      },
    }),
    { defaultValue: EMPTY_RELEASES },
  );

  // Independent of `mineOnly()` — this is what the Plan toggle's aria-pressed
  // state is derived from, regardless of whether the visible list is
  // currently filtered to "only mine".
  const plannedResource = httpResource<ReleasesResponse>(
    () => ({
      url: '/api/v1/releases',
      params: {
        from: window().from,
        to: window().to,
        includeUndated: true,
        mine: true,
        ...(seriesId() ? { seriesId: seriesId() } : {}),
      },
    }),
    { defaultValue: EMPTY_RELEASES },
  );

  const plannedBase = computed<ReadonlySet<string>>(
    () =>
      new Set(
        allBooks(plannedResource.hasValue() ? plannedResource.value() : EMPTY_RELEASES).map(
          (b) => b.id,
        ),
      ),
  );

  const plannedOverride = signal<ReadonlyMap<string, boolean>>(new Map());

  const plannedIds = computed<ReadonlySet<string>>(() => {
    const base = new Set(plannedBase());
    for (const [id, planned] of plannedOverride()) {
      if (planned) base.add(id);
      else base.delete(id);
    }
    return base;
  });

  return {
    releases: computed(() => (mainResource.hasValue() ? mainResource.value() : EMPTY_RELEASES)),
    isLoading: computed(() => mainResource.isLoading()),
    plannedIds,
    seriesId,
    mineOnly,
    togglePlan(book: BookSummary): void {
      const wasPlanned = plannedIds().has(book.id);
      plannedOverride.update((m) => new Map(m).set(book.id, !wasPlanned));
      shelfApi.update(book.id, { status: wasPlanned ? 'backlog' : 'plan' }).subscribe({
        next: () => {
          flash.show(
            wasPlanned
              ? `Removed "${book.title}" from your plan list.`
              : `Added "${book.title}" to your plan list.`,
          );
        },
        error: () => {
          plannedOverride.update((m) => new Map(m).set(book.id, wasPlanned));
          flash.show('Could not update your plan list — please try again.');
        },
      });
    },
  };
}
