import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule, type MatButtonToggleChange } from '@angular/material/button-toggle';

const SCORES = Array.from({ length: 11 }, (_, i) => i); // 0..10

/** A `MatButtonToggleGroup` acting as a radiogroup — gives arrow-key
 *  navigation, screen-reader announcement, and selection semantics for
 *  free. A `FormValueControl<number | null>`, `null` meaning genuinely
 *  unrated — `0` is a real score, not a sentinel for "no opinion". */
@Component({
  selector: 'app-rating-widget',
  imports: [MatButtonToggleModule, MatButtonModule],
  template: `
    <div class="row">
      <mat-button-toggle-group
        [attr.aria-label]="label()"
        [value]="value()"
        (change)="onChange($event)"
      >
        @for (score of scores; track score) {
          <mat-button-toggle [value]="score" [aria-label]="'Rate ' + score + ' out of 10'">
            {{ score }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
      <button mat-button type="button" class="clear" (click)="value.set(null)">Clear rating</button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class RatingWidget implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly label = input('Your rating');

  protected readonly scores = SCORES;

  protected onChange(event: MatButtonToggleChange): void {
    this.value.set(event.value as number);
  }
}
