import { Component, input } from '@angular/core';

@Component({
  selector: 'app-result-count',
  imports: [],
  template: `<p class="text-sm text-ink-muted">{{ total() }} {{ noun() }}</p>`,
})
export class ResultCount {
  readonly total = input.required<number>();
  readonly noun = input('results');
}
