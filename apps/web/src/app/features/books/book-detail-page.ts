import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { formatReleaseDate, type AuthorRef, type BookDetail, type BookStatus } from '@books/domain';
import { Flash } from '../../core/flash';
import { Chip } from '../../shared/ui/chip';
import { Pagination } from '../../shared/ui/pagination';
import { RatingWidget } from '../../shared/ui/rating-widget';
import { StatusPicker } from '../../shared/ui/status-picker';
import { BooksApi } from './books-api';
import { ShelfApi } from './shelf-api';

const COMMUNITY_PAGE_SIZE = 10;

/**
 * `MyStatusPanel` and `CommunityPanel` from the plan live inline here rather
 * than as their own components — each is a handful of lines wired directly to
 * this page's own resource and shelf calls, with no second consumer that would
 * justify extracting them.
 */
@Component({
  selector: 'app-book-detail-page',
  imports: [
    RouterLink,
    NgOptimizedImage,
    StatusPicker,
    RatingWidget,
    Chip,
    Pagination,
    DecimalPipe,
    MatButtonModule,
  ],
  template: `
    @if (detail.hasValue()) {
      @let book = detail.value();

      @if (book.deletedAt !== null) {
        <div class="trash-banner">
          <p class="trash-message">This book is in the trash.</p>
          <button mat-stroked-button type="button" class="restore-btn" (click)="restore()">
            Restore
          </button>
        </div>
      }

      <div class="header">
        @if (book.coverUrl) {
          <img
            [ngSrc]="book.coverUrl"
            [alt]="'Cover of ' + book.title"
            width="160"
            height="240"
            class="cover"
          />
        } @else {
          <div class="no-cover" aria-hidden="true">No cover</div>
        }

        <div class="details">
          <h1>{{ book.title }}</h1>
          @if (book.subtitle) {
            <p class="muted">{{ book.subtitle }}</p>
          }
          @if (book.authors.length > 0) {
            <p class="authors">{{ authorNames(book.authors) }}</p>
          }
          @if (book.seriesId) {
            <p class="series">
              <a [routerLink]="['/series', book.seriesId]">Part of a series</a>
              @if (book.seriesPosition) {
                — #{{ book.seriesPosition }}
              }
            </p>
          }
          <p class="muted release-date">
            {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
          </p>
          @if (book.description) {
            <p class="description">{{ book.description }}</p>
          }

          <p class="muted version">
            Version {{ book.version }} ·
            <a [routerLink]="['/books', book.id, 'history']">History</a>
          </p>

          <div class="actions">
            <a mat-stroked-button [routerLink]="['/books', book.id, 'edit']">Edit</a>
            @if (book.deletedAt === null) {
              <button mat-stroked-button type="button" (click)="deleteDialog.showModal()">
                Delete
              </button>
            }
          </div>
        </div>
      </div>

      <section class="section">
        <h2>Your shelf</h2>
        <div class="section-row">
          <app-status-picker [value]="myStatus()" (valueChange)="setStatus($event)" />
        </div>
        <div class="section-row">
          <app-rating-widget [value]="myRating()" (valueChange)="setRating($event)" />
        </div>
      </section>

      <section class="section">
        <h2>
          Everyone's take
          @if (book.ratingSummary.count > 0) {
            <span class="rating-summary">
              (average {{ book.ratingSummary.average | number: '1.1-1' }} from
              {{ book.ratingSummary.count }})
            </span>
          }
        </h2>
        <ul class="community-list">
          @for (entry of communityPage(); track entry.userId) {
            <li class="community-row">
              <app-chip [label]="entry.status" [tone]="entry.status" />
              @if (entry.rating !== null) {
                <span>Rated {{ entry.rating }}/10</span>
              }
            </li>
          }
        </ul>
        <app-pagination
          [page]="communityPageIndex()"
          [pageSize]="communityPageSize"
          [total]="book.statuses.length"
          (goToPage)="communityPageIndex.set($event)"
        />
      </section>

      <dialog #deleteDialog class="confirm-dialog">
        <p>
          This moves <strong>{{ book.title }}</strong> to the trash. Anyone can restore it.
        </p>
        <div class="dialog-actions">
          <button mat-stroked-button type="button" (click)="deleteDialog.close()">Cancel</button>
          <button mat-flat-button type="button" (click)="confirmDelete()">Move to trash</button>
        </div>
      </dialog>
    } @else if (detail.isLoading()) {
      <p class="muted">Loading…</p>
    } @else {
      <p class="muted">This book could not be found.</p>
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

    .header {
      display: flex;
      gap: 1.5rem;
    }

    .cover {
      border-radius: 8px;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .no-cover {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 10rem;
      height: 15rem;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 8px;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .details {
      flex: 1;
    }

    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .authors,
    .series {
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .release-date {
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    .description {
      margin-top: 1rem;
    }

    .version {
      font-size: 0.875rem;
      margin-top: 1rem;
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

    .section-row {
      margin-top: 0.75rem;
    }

    .rating-summary {
      font-size: 0.875rem;
      font-weight: 400;
      color: var(--mat-sys-on-surface-variant);
    }

    .community-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0.75rem 0 0;
      padding: 0;
      list-style: none;
    }

    .community-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
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
export class BookDetailPage {
  readonly id = input.required<string>();

  private readonly booksApi = inject(BooksApi);
  private readonly shelfApi = inject(ShelfApi);
  private readonly flash = inject(Flash);
  private readonly router = inject(Router);

  protected readonly deleteDialog = viewChild.required<HTMLDialogElement>('deleteDialog');

  protected readonly detail = httpResource<BookDetail>(() => `/api/v1/books/${this.id()}`);

  protected readonly formatReleaseDate = formatReleaseDate;

  protected readonly myStatus = linkedSignal<BookStatus>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.status ?? 'backlog') : 'backlog',
  );
  protected readonly myRating = linkedSignal<number | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.rating ?? null) : null,
  );

  protected readonly communityPageIndex = signal(1);
  protected readonly communityPageSize = COMMUNITY_PAGE_SIZE;
  protected readonly communityPage = computed(() => {
    if (!this.detail.hasValue()) return [];
    const start = (this.communityPageIndex() - 1) * COMMUNITY_PAGE_SIZE;
    return this.detail.value().statuses.slice(start, start + COMMUNITY_PAGE_SIZE);
  });

  protected authorNames(authors: readonly AuthorRef[]): string {
    return authors.map((a) => a.name).join(', ');
  }

  protected setStatus(status: BookStatus): void {
    const previous = this.myStatus();
    this.myStatus.set(status);
    this.shelfApi.update(this.id(), { status }).subscribe({
      error: () => {
        this.myStatus.set(previous);
        this.flash.show('Could not update your status — please try again.');
      },
    });
  }

  protected setRating(rating: number | null): void {
    const previous = this.myRating();
    this.myRating.set(rating);
    this.shelfApi.update(this.id(), { rating }).subscribe({
      error: () => {
        this.myRating.set(previous);
        this.flash.show('Could not update your rating — please try again.');
      },
    });
  }

  protected confirmDelete(): void {
    const title = this.detail.hasValue() ? this.detail.value().title : 'This book';
    const id = this.id();
    this.deleteDialog().close();
    this.booksApi.delete(id).subscribe({
      next: () => {
        this.flash.show(`"${title}" moved to the trash.`, () => {
          this.booksApi.restore(id).subscribe();
        });
        void this.router.navigate(['/books']);
      },
      error: () => {
        this.flash.show('Could not delete this book — please try again.');
      },
    });
  }

  protected restore(): void {
    this.booksApi.restore(this.id()).subscribe({
      next: () => this.detail.reload(),
      error: () => this.flash.show('Could not restore this book — please try again.'),
    });
  }
}
