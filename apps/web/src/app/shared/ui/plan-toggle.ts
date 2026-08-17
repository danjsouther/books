import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/** A real `<button>` with `aria-pressed`, not an icon-only affordance — used
 *  identically inside a calendar grid cell's widget and a release-list row. */
@Component({
  selector: 'app-plan-toggle',
  imports: [MatButtonModule],
  template: `
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
  `,
})
export class PlanToggle {
  readonly title = input.required<string>();
  readonly pressed = input.required<boolean>();
  readonly planToggled = output<void>();
}
