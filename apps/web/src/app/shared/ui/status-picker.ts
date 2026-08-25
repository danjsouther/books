import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { BOOK_STATUSES, type BookStatus } from '@books/domain';
import { BOOK_STATUS_LABELS } from './status-labels';

const STATUS_ICONS: Record<BookStatus, string> = {
  plan: '📌',
  backlog: '📚',
  reading: '👀',
  set_aside: '📥',
  completed: '✅',
  dropped: '✖',
};

/** A `MatButtonToggleGroup` acting as a radiogroup — a
 *  `FormValueControl<BookStatus | null>` so it binds via `[formField]`
 *  wherever a status needs picking. `null` means no shelf entry at all;
 *  re-clicking the active status clears it, removing the book from the
 *  shelf the same way `rating-widget.ts` clears a rating — listening to
 *  each toggle's own `(change)` because a single-selector group's own
 *  `(change)` never fires for a re-click of the already-pressed option (see
 *  `select.ts`). `plan` and `backlog` are the pair most easily confused, so
 *  both carry a distinct icon and color, never color alone. */
@Component({
  selector: 'app-status-picker',
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group class="row" [attr.aria-label]="label()" [value]="value()">
      @for (status of statuses; track status) {
        <mat-button-toggle
          [value]="status"
          [class]="'status-' + status"
          (change)="onToggleChange(status)"
        >
          <span aria-hidden="true">{{ icons[status] }}</span>
          {{ labels[status] }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    .row {
      border: none;
    }

    .status-plan.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-plan-container);
      --mat-button-toggle-selected-state-text-color: var(--status-plan-on-container);
    }
    .status-backlog.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-backlog-container);
      --mat-button-toggle-selected-state-text-color: var(--status-backlog-on-container);
    }
    .status-reading.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-reading-container);
      --mat-button-toggle-selected-state-text-color: var(--status-reading-on-container);
    }
    .status-set_aside.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-set_aside-container);
      --mat-button-toggle-selected-state-text-color: var(--status-set_aside-on-container);
    }
    .status-completed.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-completed-container);
      --mat-button-toggle-selected-state-text-color: var(--status-completed-on-container);
    }
    .status-dropped.mat-button-toggle-checked {
      --mat-button-toggle-selected-state-background-color: var(--status-dropped-container);
      --mat-button-toggle-selected-state-text-color: var(--status-dropped-on-container);
    }
  `,
})
export class StatusPicker implements FormValueControl<BookStatus | null> {
  readonly value = model<BookStatus | null>(null);
  readonly label = input('Reading status');

  protected readonly statuses = BOOK_STATUSES;
  protected readonly labels = BOOK_STATUS_LABELS;
  protected readonly icons = STATUS_ICONS;

  protected onToggleChange(status: BookStatus): void {
    this.value.set(this.value() === status ? null : status);
  }
}
