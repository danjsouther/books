import { Component, input } from '@angular/core';

export type ChipTone = 'plan' | 'backlog' | 'reading' | 'completed' | 'dropped' | 'neutral';

/** Icon + text + color — color is decoration on top, never the only signal
 *  (WCAG 1.4.1; see the header comment in `src/tailwind.css`). Each tone maps
 *  to both a distinct background/foreground pair AND a distinct icon glyph, so
 *  removing color still leaves the chip legible. */
@Component({
  selector: 'app-chip',
  imports: [],
  template: `
    <span class="chip" [class]="'chip-' + tone()">
      <span aria-hidden="true">{{ icon() }}</span>
      {{ label() }}
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      border-radius: 9999px;
      padding: 0.125rem 0.625rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .chip-plan {
      background: var(--color-status-plan-bg);
      color: var(--color-status-plan-fg);
    }
    .chip-backlog {
      background: var(--color-status-backlog-bg);
      color: var(--color-status-backlog-fg);
    }
    .chip-reading {
      background: var(--color-status-reading-bg);
      color: var(--color-status-reading-fg);
    }
    .chip-completed {
      background: var(--color-status-completed-bg);
      color: var(--color-status-completed-fg);
    }
    .chip-dropped {
      background: var(--color-status-dropped-bg);
      color: var(--color-status-dropped-fg);
    }
    .chip-neutral {
      background: var(--color-border);
      color: var(--color-ink);
    }
  `,
})
export class Chip {
  readonly label = input.required<string>();
  readonly tone = input<ChipTone>('neutral');
  readonly icon = input('●');
}
