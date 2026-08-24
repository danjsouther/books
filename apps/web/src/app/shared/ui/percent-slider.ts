import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';

/** A native range input rather than a Material slider — no other page in this app
 *  pulls in `@angular/material/slider`, and a plain `<input type="range">` already
 *  gives keyboard support and correct `role="slider"` semantics for free. A
 *  `FormValueControl<number | null>`, `null` meaning no progress recorded — distinct
 *  from `0`, the same reasoning as `rating-widget.ts`'s unrated state. */
@Component({
  selector: 'app-percent-slider',
  imports: [MatButtonModule],
  template: `
    <div class="row">
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        [attr.aria-label]="label()"
        [value]="value() ?? 0"
        (input)="onInput($event)"
      />
      <span class="readout">{{ value() === null ? 'Not started' : value() + '% read' }}</span>
      <button mat-button type="button" class="clear" (click)="value.set(null)">Clear</button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    input[type='range'] {
      flex: 1;
      max-width: 240px;
    }

    .readout {
      min-width: 6rem;
      font-size: 0.875rem;
    }
  `,
})
export class PercentSlider implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly label = input('Percent read');

  protected onInput(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }
}
