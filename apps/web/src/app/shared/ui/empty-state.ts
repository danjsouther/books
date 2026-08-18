import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [],
  template: `
    <div class="empty">
      <p class="title">{{ title() }}</p>
      @if (hint()) {
        <p class="hint">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `
    .empty {
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 2.5rem 1.5rem;
      text-align: center;
    }

    .title {
      font: var(--mat-sys-title-medium);
    }

    .hint {
      margin-top: 0.25rem;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
