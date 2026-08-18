import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  imports: [],
  template: `
    <div class="header">
      <h1>{{ title() }}</h1>
      <div class="actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
}
