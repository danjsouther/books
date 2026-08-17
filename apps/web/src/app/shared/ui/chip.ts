import { Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

export type ChipTone = 'plan' | 'backlog' | 'reading' | 'completed' | 'dropped' | 'neutral';

/** Icon + text + color — color is decoration on top, never the only signal
 *  (WCAG 1.4.1). Each tone maps to both a distinct container/on-container
 *  pair (see the M3 status roles in `styles.scss`) AND a distinct icon
 *  glyph, so removing color still leaves the chip legible. The container
 *  fill alone can't clear 3:1 against the page surface at M3 container
 *  lightness, so the chip's own on-container color doubles as its border
 *  for boundary perceivability. */
@Component({
  selector: 'app-chip',
  imports: [MatChipsModule],
  template: `
    <mat-chip class="chip" [class]="'chip-' + tone()" [disableRipple]="true">
      <span aria-hidden="true">{{ icon() }}</span>
      {{ label() }}
    </mat-chip>
  `,
  styles: `
    .chip {
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .chip-plan {
      --mat-chip-elevated-container-color: var(--status-plan-container);
      --mat-chip-label-text-color: var(--status-plan-on-container);
      border-color: var(--status-plan-on-container);
    }
    .chip-backlog {
      --mat-chip-elevated-container-color: var(--status-backlog-container);
      --mat-chip-label-text-color: var(--status-backlog-on-container);
      border-color: var(--status-backlog-on-container);
    }
    .chip-reading {
      --mat-chip-elevated-container-color: var(--status-reading-container);
      --mat-chip-label-text-color: var(--status-reading-on-container);
      border-color: var(--status-reading-on-container);
    }
    .chip-completed {
      --mat-chip-elevated-container-color: var(--status-completed-container);
      --mat-chip-label-text-color: var(--status-completed-on-container);
      border-color: var(--status-completed-on-container);
    }
    .chip-dropped {
      --mat-chip-elevated-container-color: var(--status-dropped-container);
      --mat-chip-label-text-color: var(--status-dropped-on-container);
      border-color: var(--status-dropped-on-container);
    }
    .chip-neutral {
      --mat-chip-elevated-container-color: var(--mat-sys-surface-container-highest);
      --mat-chip-label-text-color: var(--mat-sys-on-surface);
    }
  `,
})
export class Chip {
  readonly label = input.required<string>();
  readonly tone = input<ChipTone>('neutral');
  readonly icon = input('●');
}
