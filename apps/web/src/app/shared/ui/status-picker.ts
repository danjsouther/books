import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonToggleModule, type MatButtonToggleChange } from '@angular/material/button-toggle';
import { BOOK_STATUSES, type BookStatus } from '@books/domain';

const STATUS_META: Record<BookStatus, { label: string; icon: string }> = {
  plan: { label: 'Plan', icon: '📌' },
  backlog: { label: 'Backlog', icon: '📚' },
  reading: { label: 'Reading', icon: '👀' },
  completed: { label: 'Completed', icon: '✅' },
  dropped: { label: 'Dropped', icon: '✖' },
};

/** A `MatButtonToggleGroup` acting as a radiogroup — a
 *  `FormValueControl<BookStatus>` so it binds via `[formField]` wherever a
 *  status needs picking. `plan` and `backlog` are the pair most easily
 *  confused, so both carry a distinct icon and color, never color alone. */
@Component({
  selector: 'app-status-picker',
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group
      class="row"
      [attr.aria-label]="label()"
      [value]="value()"
      (change)="onChange($event)"
    >
      @for (status of statuses; track status) {
        <mat-button-toggle [value]="status" [class]="'status-' + status">
          <span aria-hidden="true">{{ meta[status].icon }}</span>
          {{ meta[status].label }}
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
export class StatusPicker implements FormValueControl<BookStatus> {
  readonly value = model<BookStatus>('backlog');
  readonly label = input('Reading status');

  protected readonly statuses = BOOK_STATUSES;
  protected readonly meta = STATUS_META;

  protected onChange(event: MatButtonToggleChange): void {
    this.value.set(event.value as BookStatus);
  }
}
