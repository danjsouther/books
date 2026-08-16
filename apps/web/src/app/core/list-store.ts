import { httpResource } from '@angular/common/http';
import { computed, signal, type Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import type { ListResponse } from '@books/domain';

export interface ListStore<TItem, TFilters extends Record<string, unknown>> {
  readonly items: Signal<TItem[]>;
  readonly total: Signal<number>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly isLoading: Signal<boolean>;
  readonly filters: Signal<TFilters>;
  setFilter<K extends keyof TFilters>(key: K, value: TFilters[K]): void;
  clearFilters(): void;
  goToPage(page: number): void;
}

/**
 * The client half of the list contract every collection endpoint in `docs/api.md`
 * shares — built once here rather than once per resource. `q` is debounced because
 * it is the one filter every resource defines as free text and the one that fires
 * on every keystroke; a select or checkbox filter has no burst to smooth over, so
 * only `q`-shaped churn benefits from it, and debouncing the whole filters object
 * is a fine approximation of that since a keystroke burst dominates the timing.
 *
 * Query-param URL sync is deliberately not part of this yet — see the Phase 5 plan
 * note on why that's left for whichever feature page first needs a real filter UI
 * to design against.
 *
 * Must be called from an injection context (a component or service field
 * initializer, or its constructor) — `toObservable`/`toSignal` need one, the same
 * way `inject()` does.
 */
export function createListStore<TItem, TFilters extends Record<string, unknown>>(
  url: string,
  defaultFilters: TFilters,
): ListStore<TItem, TFilters> {
  const filters = signal(defaultFilters);
  const page = signal(1);
  const pageSize = signal(20);

  const debouncedFilters = toSignal(toObservable(filters).pipe(debounceTime(250)), {
    initialValue: defaultFilters,
  });

  const params = computed(() => ({
    ...debouncedFilters(),
    page: page(),
    pageSize: pageSize(),
  }));

  const emptyPage: ListResponse<TItem> = { items: [], page: 1, pageSize: 20, total: 0 };
  const resource = httpResource<ListResponse<TItem>>(
    () => ({ url, params: params() as Record<string, string | number | boolean> }),
    { defaultValue: emptyPage },
  );
  // `value()` throws in the resource's error state rather than falling back to
  // `defaultValue` — `hasValue()` is what makes reading it safe unconditionally,
  // including when a request fails.
  const value = computed(() => (resource.hasValue() ? resource.value() : emptyPage));

  return {
    items: computed(() => value().items),
    total: computed(() => value().total),
    page,
    pageSize,
    isLoading: computed(() => resource.isLoading()),
    filters,
    setFilter: (key, value) => {
      // Any filter change makes the current page number potentially meaningless —
      // page 4 of a broader result set may not exist once it's narrowed.
      filters.update((f) => ({ ...f, [key]: value }));
      page.set(1);
    },
    clearFilters: () => {
      filters.set(defaultFilters);
      page.set(1);
    },
    goToPage: (p) => page.set(p),
  };
}
