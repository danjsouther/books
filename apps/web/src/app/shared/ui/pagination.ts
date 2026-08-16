import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  imports: [],
  template: `
    @if (pageCount() > 1) {
      <nav aria-label="Pagination" class="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          class="rounded-sm border border-border px-3 py-1 text-sm disabled:opacity-40"
          [disabled]="page() <= 1"
          (click)="goToPage.emit(page() - 1)"
        >
          Previous
        </button>
        <span class="text-sm text-ink-muted" aria-current="page">
          Page {{ page() }} of {{ pageCount() }}
        </span>
        <button
          type="button"
          class="rounded-sm border border-border px-3 py-1 text-sm disabled:opacity-40"
          [disabled]="page() >= pageCount()"
          (click)="goToPage.emit(page() + 1)"
        >
          Next
        </button>
      </nav>
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly goToPage = output<number>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
}
