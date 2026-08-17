import { Component, input, model } from '@angular/core';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface ComboboxOption {
  readonly id: string;
  readonly label: string;
}

/** A single-select async-search combobox built on `MatAutocomplete` +
 *  `MatFormField`/`matInput` — Material's autocomplete trigger owns the
 *  keyboard highlighting and `aria-activedescendant` wiring that the
 *  previous `@angular/aria`-based implementation had to do by hand. */
@Component({
  selector: 'app-combobox',
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <mat-form-field subscriptSizing="dynamic" class="field">
      <input
        #inputEl
        matInput
        type="text"
        [id]="inputId() ?? ''"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel()"
        [value]="queryText()"
        [matAutocomplete]="auto"
        (input)="queryText.set(inputEl.value)"
      />
      @if (queryText() || value()) {
        <button
          matSuffix
          mat-icon-button
          type="button"
          [attr.aria-label]="'Clear ' + (ariaLabel() || placeholder())"
          (click)="clear()"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
    </mat-form-field>
    <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelected($event)">
      @for (opt of options(); track opt.id) {
        <mat-option [value]="opt.id">{{ opt.label }}</mat-option>
      } @empty {
        <mat-option disabled>{{ loading() ? 'Searching…' : 'No matches.' }}</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
})
export class AppCombobox {
  readonly options = input.required<readonly ComboboxOption[]>();
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  /** Goes on the inner `<input>`, which is what a `<label for>` has to point at
   *  — an `id` set on `<app-combobox>` itself lands on the host element, where
   *  it associates a label with nothing. */
  readonly inputId = input<string>();
  /** Renders "Searching…" rather than "No matches." while a search is in
   *  flight, so an async consumer never flashes a false negative. */
  readonly loading = input(false);
  /** What's currently typed — bind this out to drive your own search request.
   *  Not the same as `value`, which is which option is actually selected. */
  readonly queryText = model('');
  readonly value = model<string | null>(null);

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const selectedId = event.option.value as string;
    this.value.set(selectedId);
    this.queryText.set(event.option.viewValue);
  }

  protected clear(): void {
    this.queryText.set('');
    this.value.set(null);
  }
}
