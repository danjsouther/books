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
 */
@Component({
  selector: 'app-select',
  imports: [Listbox, Option],
  template: `
    <div
      ngListbox
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
