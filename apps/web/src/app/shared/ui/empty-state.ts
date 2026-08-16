import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [],
  template: `
    <div class="rounded-md border border-dashed border-border px-6 py-10 text-center">
      <p class="font-medium">{{ title() }}</p>
      @if (hint()) {
        <p class="mt-1 text-sm text-ink-muted">{{ hint() }}</p>
      }
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
