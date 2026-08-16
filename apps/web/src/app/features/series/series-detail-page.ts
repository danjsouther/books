import { Component, input } from '@angular/core';

/** The real detail page is Phase 6. */
@Component({
  selector: 'app-series-detail-page',
  imports: [],
  template: `<h1 class="text-2xl font-semibold">Series {{ id() }}</h1>`,
})
export class SeriesDetailPage {
  readonly id = input.required<string>();
}
