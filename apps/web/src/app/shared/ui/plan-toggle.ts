import { Component, input, output } from '@angular/core';

/** A real `<button>` with `aria-pressed`, not an icon-only affordance — used
 *  identically inside a calendar grid cell's widget and a release-list row. */
@Component({
  selector: 'app-plan-toggle',
  imports: [],
  template: `
    <button
      type="button"
      class="rounded-full border border-border px-2.5 py-1 text-xs font-medium aria-pressed:border-status-plan-fg aria-pressed:bg-status-plan-bg aria-pressed:text-status-plan-fg"
      [attr.aria-pressed]="pressed()"
      [attr.aria-label]="'Plan ' + title()"
      (click)="planToggled.emit()"
    >
      {{ pressed() ? '✓ Planned' : '+ Plan' }}
    </button>
  `,
})
export class PlanToggle {
  readonly title = input.required<string>();
  readonly pressed = input.required<boolean>();
  readonly planToggled = output<void>();
}
