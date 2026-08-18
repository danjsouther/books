import { Component, input } from '@angular/core';

/** Pulsing placeholder blocks, shown only while a list is loading its very
 *  first page — once any data has rendered once, a loading overlay is used
 *  instead so the previous page never flashes to empty. */
@Component({
  selector: 'app-skeleton',
  imports: [],
  template: `
    <div class="stack" aria-hidden="true">
      @for (row of rows(); track $index) {
        <div class="row"></div>
      }
    </div>
  `,
  styles: `
    .stack {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .row {
      height: 4rem;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-highest);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .row {
        animation: none;
      }
    }
  `,
})
export class Skeleton {
  readonly count = input(5);
  protected readonly rows = () => Array.from({ length: this.count() }, (_, i) => i);
}
