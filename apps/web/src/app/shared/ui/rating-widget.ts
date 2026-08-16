import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

const SCORES = Array.from({ length: 11 }, (_, i) => i); // 0..10

/** Eleven native radios styled as a bar, not a star strip or a custom slider —
 *  native radios give arrow-key navigation, screen-reader announcement, and
 *  form semantics for free, which a hand-rolled 0-10 widget reliably fails at
 *  (the classic AXE finding). A `FormValueControl<number | null>`, `null`
 *  meaning genuinely unrated — `0` is a real score, not a sentinel for "no
 *  opinion". */
@Component({
  selector: 'app-rating-widget',
  imports: [],
  template: `
    <fieldset class="border-0 p-0">
      <legend class="sr-only">{{ label() }}</legend>
      <div class="flex flex-wrap items-center gap-1">
        @for (score of scores; track score) {
          <label class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              [name]="groupName"
              [value]="score"
              [checked]="value() === score"
              [attr.aria-label]="'Rate ' + score + ' out of 10'"
              (change)="value.set(score)"
            />
            <span
              class="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-sm peer-checked:border-focus peer-checked:bg-focus/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
            >
              {{ score }}
            </span>
          </label>
        }
        <button type="button" class="ml-2 text-sm underline" (click)="value.set(null)">
          Clear rating
        </button>
      </div>
    </fieldset>
  `,
})
export class RatingWidget implements FormValueControl<number | null> {
  private static nextId = 0;

  readonly value = model<number | null>(null);
  readonly label = input('Your rating');

  protected readonly scores = SCORES;
  protected readonly groupName = `rating-widget-${String(RatingWidget.nextId++)}`;
}
