import { Combobox, ComboboxPopup, ComboboxWidget } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { Component, effect, input, linkedSignal, model, signal } from '@angular/core';

export interface ComboboxOption {
  readonly id: string;
  readonly label: string;
}

/**
 * A single-select combobox: `[ngCombobox]` (the text input) + a deferred
 * `ng-template[ngComboboxPopup]` + `[ngComboboxWidget][ngListbox]` inside it.
 *
 * Two things the package does NOT do for you, confirmed by reading
 * `node_modules/@angular/aria/types/combobox.d.ts` directly rather than
 * assuming: it does not filter options (the consumer owns that — bind
 * `queryText` out and use it to drive your own search, e.g. `GET /series?q=`),
 * and it does not wire keyboard highlighting between the popup and the inner
 * listbox automatically — `[activeDescendant]="listboxRef.activeDescendant()"`
 * below is that wiring, done by hand, exactly as the package's own example
 * does it. Get this one binding wrong and the widget still "works" with a
 * mouse while silently losing keyboard support — see `combobox.spec.ts`.
 *
 * One thing the package's own JSDoc example gets wrong by omission:
 * `ngListbox` defaults to `focusMode="roving"`, which moves real DOM focus
 * onto each option as it's highlighted — impossible here, since focus has to
 * stay on the text input for typing to keep working. Without
 * `focusMode="activedescendant"` below, the popup still opens and looks fine,
 * options still highlight visually (`data-active`), but `aria-activedescendant`
 * on the input never updates — the widget silently loses its keyboard a11y
 * contract while looking, and mostly working, completely normal. Found only by
 * writing `combobox.spec.ts` and inspecting the rendered attributes by hand;
 * the vendor's own example in `combobox.d.ts` does not set this.
 */
@Component({
  selector: 'app-combobox',
  imports: [Combobox, ComboboxPopup, ComboboxWidget, Listbox, Option],
  template: `
    <div class="relative">
      <input
        ngCombobox
        #combobox="ngCombobox"
        type="text"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel()"
        [(value)]="queryText"
        [(expanded)]="expanded"
        class="w-full rounded-sm border border-border px-3 py-1.5 text-sm aria-expanded:rounded-b-none"
      />
      <ng-template ngComboboxPopup [combobox]="combobox">
        <div
          ngComboboxWidget
          #listboxRef="ngListbox"
          ngListbox
          focusMode="activedescendant"
          [activeDescendant]="listboxRef.activeDescendant()"
          [(value)]="listboxValue"
          class="absolute z-10 max-h-60 w-full overflow-auto rounded-b-md border border-t-0 border-border bg-surface shadow-md"
        >
          @for (opt of options(); track opt.id) {
            <div
              ngOption
              [id]="optionId(opt.id)"
              [value]="opt.id"
              [label]="opt.label"
              class="cursor-pointer px-3 py-1.5 text-sm aria-selected:bg-focus/10 data-active:bg-surface-sunken"
            >
              {{ opt.label }}
            </div>
          } @empty {
            <p class="px-3 py-1.5 text-sm text-ink-muted">No matches.</p>
          }
        </div>
      </ng-template>
    </div>
  `,
})
export class AppCombobox {
  private static nextId = 0;
  private readonly instanceId = AppCombobox.nextId++;

  readonly options = input.required<readonly ComboboxOption[]>();
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  /** What's currently typed — bind this out to drive your own search request.
   *  Not the same as `value`, which is which option is actually selected. */
  readonly queryText = model('');
  readonly value = model<string | null>(null);

  protected readonly expanded = signal(false);
  protected readonly listboxValue = linkedSignal<string[]>(() =>
    this.value() === null ? [] : [this.value()!],
  );

  constructor() {
    // The listbox is the source of truth once a selection is made — mirror it
    // back into `value`, close the popup, and show the chosen label rather
    // than leaving whatever partial text was typed.
    effect(() => {
      const selectedId = this.listboxValue()[0] ?? null;
      if (selectedId === this.value()) return;
      this.value.set(selectedId);
      this.expanded.set(false);
      const label = this.options().find((o) => o.id === selectedId)?.label ?? '';
      this.queryText.set(label);
    });
  }

  protected optionId(id: string): string {
    return `combobox-${String(this.instanceId)}-option-${id}`;
  }
}
