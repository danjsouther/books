import { Component, input } from '@angular/core';
import type { FieldDiff } from '@books/domain';

/** Renders a field-level diff as a description list — before/after per field —
 *  never as a character-level text diff. The fields are structured, so treating
 *  them as prose would be a downgrade. */
@Component({
  selector: 'app-diff-list',
  imports: [],
  template: `
    @if (diffs().length === 0) {
      <p class="empty">No fields changed.</p>
    } @else {
      <dl class="list">
        @for (diff of diffs(); track diff.field) {
          <div class="row">
            <dt class="field">{{ diff.field }}</dt>
            <dd class="before">{{ render(diff.before) }}</dd>
            <dd class="after">{{ render(diff.after) }}</dd>
          </div>
        }
      </dl>
    }
  `,
  styles: `
    .empty {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .list {
      margin: 0;
    }

    .row {
      display: grid;
      grid-template-columns: 8rem 1fr 1fr;
      gap: 1rem;
      padding: 0.5rem 0;
      font: var(--mat-sys-body-medium);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .row:last-child {
      border-bottom: none;
    }

    .field {
      font-weight: 600;
      margin: 0;
    }

    .before {
      color: var(--mat-sys-on-surface-variant);
      text-decoration: line-through;
      margin: 0;
    }

    .after {
      margin: 0;
    }
  `,
})
export class DiffList {
  readonly diffs = input.required<readonly FieldDiff[]>();

  protected render(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
}
