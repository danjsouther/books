import { Listbox, Option } from '@angular/aria/listbox';
import { Component, effect, input, linkedSignal, model } from '@angular/core';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

/**
 * A single-select, always-visible `ngListbox` — a filter chip row, not a
 * collapsing dropdown. `@angular/aria` has no built-in trigger/popup mechanism
 * for a bare `Listbox` (that machinery belongs to `Combobox`); building one from
 * scratch for a handful of filter options would mean re-deriving most of
 * `app-combobox` for no real benefit here, so this deliberately stays inline —
 * a real simplification worth recording, not an oversight.
 *
 * `selectionMode="explicit"` is required, not the default. `Listbox` defaults
 * to `selectionMode="follow"` — "the focused item is automatically selected"
 * — and establishes an initial active item (the first one, via roving
 * tabindex) on mount whether or not anyone has interacted with it yet. Left
 * at the default, `AppSelect` silently reports its first option as selected
 * immediately after render, with no click or keypress involved — a real,
 * previously-undetected bug (found by `select.spec.ts`) that a consumer
 * without a debounce between the model and its effect (unlike
 * `createListStore`'s filter debounce, which happened to mask it) would see
 * as an unrequested filter applied on page load.
 */
@Component({
  selector: 'app-select',
  imports: [Listbox, Option],
  template: `
    <div
      ngListbox
      selectionMode="explicit"
      [attr.aria-label]="ariaLabel()"
      [(value)]="internalValue"
      class="flex flex-wrap gap-2"
    >
      @for (opt of options(); track opt.id) {
        <div
          ngOption
          [value]="opt.id"
          [label]="opt.label"
          class="cursor-pointer rounded-full border border-border px-3 py-1 text-sm aria-selected:border-focus aria-selected:bg-focus/10 data-active:ring-2 data-active:ring-focus"
        >
          {{ opt.label }}
        </div>
      }
    </div>
  `,
})
export class AppSelect {
  readonly options = input.required<readonly SelectOption[]>();
  readonly ariaLabel = input('');
  readonly value = model<string | null>(null);

  protected readonly internalValue = linkedSignal<string[]>(() =>
    this.value() === null ? [] : [this.value()!],
  );

  constructor() {
    effect(() => {
      const selected = this.internalValue()[0] ?? null;
      if (selected !== this.value()) this.value.set(selected);
    });
  }
}
