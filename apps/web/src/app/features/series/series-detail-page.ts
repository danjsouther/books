import { httpResource } from '@angular/common/http';
import { Component, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { BookSummary, ListResponse, SeriesDetail } from '@books/domain';
import { Flash } from '../../core/flash';
import { SeriesApi } from './series-api';

@Component({
  selector: 'app-series-detail-page',
  imports: [RouterLink],
  template: `
    @if (detail.hasValue()) {
      @let series = detail.value();

      @if (series.deletedAt !== null) {
        <div class="mb-6 rounded-md border border-status-dropped-fg/40 bg-status-dropped-bg p-4">
          <p class="font-medium text-status-dropped-fg">This series is in the trash.</p>
          <button
            type="button"
            class="mt-2 rounded-sm border border-border px-3 py-1.5 text-sm"
            (click)="restore()"
          >
            Restore
          </button>
        </div>
      }

      <h1 class="text-2xl font-semibold">{{ series.name }}</h1>
      @if (series.description) {
        <p class="mt-2">{{ series.description }}</p>
      }
      <p class="mt-2 text-sm text-ink-muted">
        Version {{ series.version }} ·
        <a [routerLink]="['/series', series.id, 'history']" class="underline">History</a>
      </p>

      <div class="mt-4 flex gap-2">
        <a
          [routerLink]="['/series', series.id, 'edit']"
          class="rounded-sm border border-border px-3 py-1.5 text-sm"
        >
          Edit
        </a>
        @if (series.deletedAt === null) {
          <button
            type="button"
            class="rounded-sm border border-border px-3 py-1.5 text-sm"
            (click)="deleteDialog.showModal()"
          >
            Delete
          </button>
        }
      </div>

      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-lg font-semibold">Books in this series</h2>
        @if (books.hasValue()) {
          <ul class="mt-3 space-y-1">
            @for (book of books.value().items; track book.id) {
              <li>
                <a [routerLink]="['/books', book.id]" class="underline">{{ book.title }}</a>
                @if (book.seriesPosition) {
                  <span class="text-sm text-ink-muted"> — #{{ book.seriesPosition }}</span>
                }
              </li>
            }
          </ul>
        }
      </section>

      <dialog #deleteDialog class="rounded-md border border-border p-6">
        <p>
          This moves <strong>{{ series.name }}</strong> to the trash. Anyone can restore it. Its
          books are unaffected.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-sm border border-border px-3 py-1.5 text-sm"
            (click)="deleteDialog.close()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-sm border border-border px-3 py-1.5 text-sm"
            (click)="confirmDelete()"
          >
            Move to trash
          </button>
        </div>
      </dialog>
    } @else if (detail.isLoading()) {
      <p class="text-ink-muted">Loading…</p>
    } @else {
      <p class="text-ink-muted">This series could not be found.</p>
    }
  `,
})
export class SeriesDetailPage {
  readonly id = input.required<string>();

  private readonly seriesApi = inject(SeriesApi);
  private readonly flash = inject(Flash);
  private readonly router = inject(Router);

  protected readonly deleteDialog = viewChild.required<HTMLDialogElement>('deleteDialog');

  protected readonly detail = httpResource<SeriesDetail>(() => `/api/v1/series/${this.id()}`);
  protected readonly books = httpResource<ListResponse<BookSummary>>(() => ({
    url: `/api/v1/series/${this.id()}/books`,
    params: { pageSize: 50 },
  }));

  protected confirmDelete(): void {
    const name = this.detail.hasValue() ? this.detail.value().name : 'This series';
    const id = this.id();
    this.deleteDialog().close();
    this.seriesApi.delete(id).subscribe({
      next: () => {
        this.flash.show(`"${name}" moved to the trash.`, () => {
          this.seriesApi.restore(id).subscribe();
        });
        void this.router.navigate(['/series']);
      },
      error: () => this.flash.show('Could not delete this series — please try again.'),
    });
  }

  protected restore(): void {
    this.seriesApi.restore(this.id()).subscribe({
      next: () => this.detail.reload(),
      error: () => this.flash.show('Could not restore this series — please try again.'),
    });
  }
}
