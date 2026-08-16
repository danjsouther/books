import { Component, input } from '@angular/core';

/** Pulsing placeholder blocks, shown only while a list is loading its very
 *  first page — once any data has rendered once, a loading overlay is used
 *  instead so the previous page never flashes to empty. */
@Component({
  selector: 'app-skeleton',
  imports: [],
  template: `
    <div class="space-y-3" aria-hidden="true">
      @for (row of rows(); track $index) {
        <div class="h-16 animate-pulse rounded-md bg-border/40"></div>
      }
    </div>
  `,
})
export class Skeleton {
  readonly count = input(5);
  protected readonly rows = () => Array.from({ length: this.count() }, (_, i) => i);
}
