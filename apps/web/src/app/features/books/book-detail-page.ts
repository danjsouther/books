import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { debounceTime, Subject } from 'rxjs';
import { formatReleaseDate, type AuthorRef, type BookDetail, type BookStatus } from '@books/domain';
import { Flash } from '../../core/flash';
import { BookCover } from '../../shared/ui/book-cover';
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
    BookCover,
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
        <app-book-cover [src]="book.coverUrl" [title]="book.title" [width]="160" [height]="240" />

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
              <a [routerLink]="['/series', book.seriesId]">{{ book.seriesName ?? 'Series' }}</a>
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

  protected readonly myStatus = linkedSignal<BookStatus | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.status ?? null) : null,
  );
  protected readonly myRating = linkedSignal<number | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.rating ?? null) : null,
  );

  /**
   * The server's last-acknowledged status/rating — separate from
   * `myStatus`/`myRating`, which flip immediately on every click for instant
   * feedback. Rolling a failed save back to "whatever was clicked just
   * before this one" would still be wrong mid-burst; rolling back to the
   * last value the server actually confirmed is the only value that's
   * still true after several optimistic updates in a row.
   */
  private confirmedStatus: BookStatus | null = null;
  private confirmedRating: number | null = null;
  private hasSeededConfirmed = false;

  private readonly statusChanges = new Subject<BookStatus | null>();
  private readonly ratingChanges = new Subject<number | null>();

  protected readonly communityPageIndex = signal(1);
  protected readonly communityPageSize = COMMUNITY_PAGE_SIZE;
  protected readonly communityPage = computed(() => {
    if (!this.detail.hasValue()) return [];
    const start = (this.communityPageIndex() - 1) * COMMUNITY_PAGE_SIZE;
    return this.detail.value().statuses.slice(start, start + COMMUNITY_PAGE_SIZE);
  });

  constructor() {
    // Seed the "confirmed" baseline exactly once, from whatever the server
    // already had on load — re-running this on a later reload would clobber
    // it with a value that might now be stale relative to an in-flight edit.
    effect(() => {
      if (!this.detail.hasValue() || this.hasSeededConfirmed) return;
      const status = this.detail.value().myStatus;
      untracked(() => {
        this.confirmedStatus = status?.status ?? null;
        this.confirmedRating = status?.rating ?? null;
        this.hasSeededConfirmed = true;
      });
    });

    // Debounced so that clicking through several statuses/ratings in a row
    // — the display updates instantly on every click — sends one request
    // and produces one activity-feed entry for the settled value, not one
    // per click. A `null` status means the status toggle was deselected —
    // that removes the book from the shelf entirely, taking the rating
    // with it, rather than patching the status field alone.
    this.statusChanges.pipe(debounceTime(600), takeUntilDestroyed()).subscribe((status) => {
      const onError = () => {
        this.myStatus.set(this.confirmedStatus);
        this.flash.show('Could not update your status — please try again.');
      };
      if (status === null) {
        this.shelfApi.remove(this.id()).subscribe({
          next: () => {
            this.confirmedStatus = null;
            this.confirmedRating = null;
            this.myRating.set(null);
          },
          error: onError,
        });
      } else {
        this.shelfApi.update(this.id(), { status }).subscribe({
          next: () => {
            this.confirmedStatus = status;
          },
          error: onError,
        });
      }
    });

    this.ratingChanges.pipe(debounceTime(600), takeUntilDestroyed()).subscribe((rating) => {
      this.shelfApi.update(this.id(), { rating }).subscribe({
        next: () => {
          this.confirmedRating = rating;
        },
        error: () => {
          this.myRating.set(this.confirmedRating);
          this.flash.show('Could not update your rating — please try again.');
        },
      });
    });
  }

  protected authorNames(authors: readonly AuthorRef[]): string {
    return authors.map((a) => a.name).join(', ');
  }

  protected setStatus(status: BookStatus | null): void {
    this.myStatus.set(status);
    this.statusChanges.next(status);
  }

  protected setRating(rating: number | null): void {
    this.myRating.set(rating);
    this.ratingChanges.next(rating);
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
