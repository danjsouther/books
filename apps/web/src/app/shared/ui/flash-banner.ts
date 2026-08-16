import { Component, inject } from '@angular/core';
import { Flash } from '../../core/flash';

@Component({
  selector: 'app-flash-banner',
  imports: [],
  template: `
    @if (flash.message(); as current) {
      <div
        role="status"
        aria-live="polite"
        class="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-md border border-border bg-surface px-4 py-2 shadow-md"
      >
        <span class="text-sm">{{ current.message }}</span>
        @if (current.undo; as undo) {
          <button type="button" class="text-sm font-semibold underline" (click)="runUndo(undo)">
            Undo
          </button>
        }
      </div>
    }
  `,
})
export class FlashBanner {
  protected readonly flash = inject(Flash);

  protected runUndo(undo: () => void): void {
    undo();
    this.flash.clear();
  }
}
