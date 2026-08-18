import { Component, input } from '@angular/core';

@Component({
  selector: 'app-result-count',
  imports: [],
  template: `<p class="count">{{ total() }} {{ noun() }}</p>`,
  styles: `
    .count {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ResultCount {
  readonly total = input.required<number>();
  readonly noun = input('results');
}
