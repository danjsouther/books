import { Component, input, model } from '@angular/core';
import { MatButtonToggleModule, type MatButtonToggleChange } from '@angular/material/button-toggle';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

/** A single-select, always-visible filter chip row — `MatButtonToggleGroup`
 *  with no `multiple` attribute gives single-select semantics (a radiogroup)
 *  for free, deselectable by clicking the pressed toggle again since
 *  `value` starts `null` and there's no required-selection constraint. */
@Component({
  selector: 'app-select',
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group
      class="row"
      [attr.aria-label]="ariaLabel()"
      [value]="value()"
      (change)="onChange($event)"
    >
      @for (opt of options(); track opt.id) {
        <mat-button-toggle [value]="opt.id">{{ opt.label }}</mat-button-toggle>
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

  protected onChange(event: MatButtonToggleChange): void {
    this.value.set(event.value as string);
  }
}
