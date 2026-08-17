import { booleanAttribute, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * A real `<button>` with `aria-pressed` — never a bare icon glyph — in both of
 * its shapes. `compact` swaps the "+ Plan"/"✓ Planned" label for a plus/check
 * icon, for the calendar, where a day cell has no room for a text button and may
 * hold several releases at once. The icon carries no accessible name of its own
 * (`mat-icon` is `aria-hidden`), so the button keeps naming itself through
 * `aria-label` in both shapes and the pressed state stays in `aria-pressed`
 * rather than in the glyph.
 */
@Component({
  selector: 'app-plan-toggle',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (compact()) {
      <button
        mat-icon-button
        type="button"
        class="toggle compact"
        [class.pressed]="pressed()"
        [attr.aria-pressed]="pressed()"
        [attr.aria-label]="'Plan ' + title()"
        (click)="planToggled.emit()"
      >
        <mat-icon class="icon">{{ pressed() ? 'check' : 'add' }}</mat-icon>
      </button>
    } @else {
      <button
        mat-stroked-button
        type="button"
        class="toggle"
        [class.pressed]="pressed()"
        [attr.aria-pressed]="pressed()"
        [attr.aria-label]="'Plan ' + title()"
        (click)="planToggled.emit()"
      >
        {{ pressed() ? '✓ Planned' : '+ Plan' }}
      </button>
    }
  `,
  styles: `
    .toggle {
      border-radius: 9999px;
      font-size: 0.75rem;
      line-height: 1;
      padding: 0.375rem 0.75rem;
    }

    .toggle.pressed {
      border-color: var(--status-plan-on-container);
      background: var(--status-plan-container);
      color: var(--status-plan-on-container);
    }

    /* 24px square is the floor a pointer target may shrink to (WCAG 2.2
       Target Size (Minimum)) — small enough for a day cell, still hittable.
       The touch target must be pulled down to match: it defaults to a 48px
       span centred on the button, which at this size would spill 12px out of
       every side — overflowing a narrow calendar cell and, worse, overlapping
       the invisible target of the release stacked directly beneath it. */
    .toggle.compact {
      --mat-icon-button-state-layer-size: 24px;
      --mat-icon-button-touch-target-size: 24px;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .toggle.compact .icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      line-height: 16px;
    }
  `,
})
export class PlanToggle {
  readonly title = input.required<string>();
  readonly pressed = input.required<boolean>();
  /** Icon-only, for space-constrained hosts like a calendar day cell. */
  readonly compact = input(false, { transform: booleanAttribute });
  readonly planToggled = output<void>();
}
