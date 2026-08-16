import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { BOOK_STATUSES, type BookStatus } from '@books/domain';
import { Chip, type ChipTone } from './chip';

const STATUS_META: Record<BookStatus, { label: string; icon: string }> = {
  plan: { label: 'Plan', icon: '📌' },
  backlog: { label: 'Backlog', icon: '📚' },
  reading: { label: 'Reading', icon: '👀' },
  completed: { label: 'Completed', icon: '✅' },
  dropped: { label: 'Dropped', icon: '✖' },
};

/** Five native radios, not a custom widget — a `FormValueControl<BookStatus>`
 *  so it binds via `[formField]` wherever a status needs picking. `plan` and
 *  `backlog` are the pair most easily confused, so both carry a distinct icon
 *  and color, never color alone. */
@Component({
  selector: 'app-status-picker',
  imports: [Chip],
  template: `
    <fieldset class="border-0 p-0">
      <legend class="sr-only">{{ label() }}</legend>
      <div class="flex flex-wrap gap-2">
        @for (status of statuses; track status) {
          <label class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              [name]="groupName"
              [value]="status"
              [checked]="value() === status"
              (change)="value.set(status)"
            />
            <span
              class="rounded-full outline-offset-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
            >
              <app-chip
                [label]="meta[status].label"
                [tone]="toneOf(status)"
                [icon]="meta[status].icon"
              />
            </span>
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class StatusPicker implements FormValueControl<BookStatus> {
  private static nextId = 0;

  readonly value = model<BookStatus>('backlog');
  readonly label = input('Reading status');

  protected readonly statuses = BOOK_STATUSES;
  protected readonly meta = STATUS_META;
  protected readonly groupName = `status-picker-${String(StatusPicker.nextId++)}`;

  protected toneOf(status: BookStatus): ChipTone {
    return status;
  }
}
