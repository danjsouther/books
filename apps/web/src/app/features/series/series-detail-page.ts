import { httpResource } from '@angular/common/http';
import { Component, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import type { BookSummary, ListResponse, SeriesDetail } from '@books/domain';
import { Flash } from '../../core/flash';
import { SeriesApi } from './series-api';

@Component({
  selector: 'app-series-detail-page',
  imports: [RouterLink, MatButtonModule],
  template: `
    @if (detail.hasValue()) {
      @let series = detail.value();

      @if (series.deletedAt !== null) {
        <div class="trash-banner">
          <p class="trash-message">This series is in the trash.</p>
          <button mat-stroked-button type="button" class="restore-btn" (click)="restore()">
            Restore
          </button>
        </div>
      }

      <h1>{{ series.name }}</h1>
      @if (series.description) {
        <p class="description">{{ series.description }}</p>
      }
      <p class="muted version">
        Version {{ series.version }} ·
        <a [routerLink]="['/series', series.id, 'history']">History</a>
      </p>

      <div class="actions">
        <a mat-stroked-button [routerLink]="['/series', series.id, 'edit']">Edit</a>
        @if (series.deletedAt === null) {
          <button mat-stroked-button type="button" (click)="deleteDialog.showModal()">
            Delete
          </button>
        }
      </div>

      <section class="section">
        <h2>Books in this series</h2>
        @if (books.hasValue()) {
          <ul class="book-list">
            @for (book of books.value().items; track book.id) {
              <li>
                <a [routerLink]="['/books', book.id]">{{ book.title }}</a>
                @if (book.seriesPosition) {
                  <span class="muted"> — #{{ book.seriesPosition }}</span>
                }
              </li>
            }
          </ul>
        }
      </section>

      <dialog #deleteDialog class="confirm-dialog">
        <p>
          This moves <strong>{{ series.name }}</strong> to the trash. Anyone can restore it. Its
          books are unaffected.
        </p>
        <div class="dialog-actions">
          <button mat-stroked-button type="button" (click)="deleteDialog.close()">Cancel</button>
          <button mat-flat-button type="button" (click)="confirmDelete()">Move to trash</button>
        </div>
      </dialog>
    } @else if (detail.isLoading()) {
      <p class="muted">Loading…</p>
    } @else {
      <p class="muted">This series could not be found.</p>
    }
  `,
  styles: `
    .trash-banner {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border: 1px solid var(--status-dropped-on-container);
      border-radius: 8px;
      background: var(--status-dropped-container);
    }

    .trash-message {
      font-weight: 600;
      color: var(--status-dropped-on-container);
      margin: 0;
    }

    .restore-btn {
      margin-top: 0.5rem;
    }

    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .description {
      margin-top: 0.5rem;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .version {
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    a {
      color: var(--mat-sys-primary);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .section {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .section h2 {
      font: var(--mat-sys-title-large);
      margin: 0;
    }

    .book-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin: 0.75rem 0 0;
      padding: 0;
      list-style: none;
    }

    .confirm-dialog {
      border-radius: 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      padding: 1.5rem;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
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
