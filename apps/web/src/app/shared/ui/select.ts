import { Component, input, model } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

/**
 * A single-select, always-visible filter chip row — `MatButtonToggleGroup`
 * with no `multiple` attribute gives single-select semantics (a radiogroup)
 * for free, but NOT click-to-deselect: confirmed in Material's own source
 * (`MatButtonToggle._onButtonClick()`, `button-toggle.mjs`) that a
 * single-selector toggle always sets `newChecked = true` on click, with no
 * native way to click a pressed toggle back off. `value` is nullable here —
 * "no filter selected" is a real, valid state — so this listens to each
 * individual toggle's own `(change)` (which fires on every click,
 * including a re-click of the already-pressed one, unlike the group's own
 * `(change)`) and clears the value itself when the clicked option was
 * already selected.
 */
@Component({
  selector: 'app-select',
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group class="row" [attr.aria-label]="ariaLabel()" [value]="value()">
      @for (opt of options(); track opt.id) {
        <mat-button-toggle [value]="opt.id" (change)="onToggleChange(opt.id)">
          {{ opt.label }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      border: none;
    }
  `,
})
export class AppSelect {
  readonly options = input.required<readonly SelectOption[]>();
  readonly ariaLabel = input('');
  readonly value = model<string | null>(null);

  protected onToggleChange(id: string): void {
    this.value.set(this.value() === id ? null : id);
  }
}
