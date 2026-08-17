import { Component, computed, input, output } from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';

@Component({
  selector: 'app-pagination',
  imports: [MatPaginatorModule],
  template: `
    @if (pageCount() > 1) {
      <mat-paginator
        class="paginator"
        aria-label="Pagination"
        [length]="total()"
        [pageSize]="pageSize()"
        [pageIndex]="page() - 1"
        [hidePageSize]="true"
        [showFirstLastButtons]="false"
        (page)="onPage($event)"
      />
    }
  `,
  styles: `
    .paginator {
      display: flex;
      justify-content: center;
      margin-top: 1.5rem;
      background: transparent;
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

  protected onPage(event: PageEvent): void {
    this.goToPage.emit(event.pageIndex + 1);
  }
}
