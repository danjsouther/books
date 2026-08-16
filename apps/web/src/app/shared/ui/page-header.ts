import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  imports: [],
  template: `
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ title() }}</h1>
      <div class="flex items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
}
