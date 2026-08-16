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
      <p class="text-sm text-ink-muted">No fields changed.</p>
    } @else {
      <dl class="divide-y divide-border">
        @for (diff of diffs(); track diff.field) {
          <div class="grid grid-cols-[8rem_1fr_1fr] gap-4 py-2 text-sm">
            <dt class="font-medium">{{ diff.field }}</dt>
            <dd class="text-ink-muted line-through">{{ render(diff.before) }}</dd>
            <dd>{{ render(diff.after) }}</dd>
          </div>
        }
      </dl>
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
