import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  ],
  template: `
    @if (detail.hasValue()) {
      @let book = detail.value();

      @if (book.deletedAt !== null) {
        <div class="mb-6 rounded-md border border-status-dropped-fg/40 bg-status-dropped-bg p-4">
          <p class="font-medium text-status-dropped-fg">This book is in the trash.</p>
          <button
            type="button"
            class="mt-2 rounded-sm border border-border px-3 py-1.5 text-sm"
            (click)="restore()"
          >
            Restore
          </button>
        </div>
      }

      <div class="flex gap-6">
        @if (book.coverUrl) {
          <img
            [ngSrc]="book.coverUrl"
            [alt]="'Cover of ' + book.title"
            width="160"
            height="240"
            class="rounded-md border border-border"
          />
        } @else {
          <div
            class="flex h-60 w-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-ink-muted"
            aria-hidden="true"
          >
            No cover
          </div>
        }

        <div class="flex-1">
          <h1 class="text-2xl font-semibold">{{ book.title }}</h1>
          @if (book.subtitle) {
            <p class="text-ink-muted">{{ book.subtitle }}</p>
          }
          @if (book.authors.length > 0) {
            <p class="mt-1 text-sm">{{ authorNames(book.authors) }}</p>
          }
          @if (book.seriesId) {
            <p class="mt-1 text-sm">
              <a [routerLink]="['/series', book.seriesId]" class="underline">Part of a series</a>
              @if (book.seriesPosition) {
                — #{{ book.seriesPosition }}
              }
            </p>
          }
          <p class="mt-2 text-sm text-ink-muted">
            {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
          </p>
          @if (book.description) {
            <p class="mt-4">{{ book.description }}</p>
          }

          <p class="mt-4 text-sm text-ink-muted">
            Version {{ book.version }} ·
            <a [routerLink]="['/books', book.id, 'history']" class="underline">History</a>
          </p>

          <div class="mt-4 flex gap-2">
            <a
              [routerLink]="['/books', book.id, 'edit']"
              class="rounded-sm border border-border px-3 py-1.5 text-sm"
            >
              Edit
            </a>
            @if (book.deletedAt === null) {
              <button
                type="button"
                class="rounded-sm border border-border px-3 py-1.5 text-sm"
                (click)="deleteDialog.showModal()"
              >
                Delete
              </button>
            }
          </div>
        </div>
      </div>

      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-lg font-semibold">Your shelf</h2>
        <div class="mt-3">
          <app-status-picker [value]="myStatus()" (valueChange)="setStatus($event)" />
        </div>
        <div class="mt-3">
          <app-rating-widget [value]="myRating()" (valueChange)="setRating($event)" />
        </div>
      </section>

      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-lg font-semibold">
          Everyone's take
          @if (book.ratingSummary.count > 0) {
            <span class="text-sm font-normal text-ink-muted">
              (average {{ book.ratingSummary.average | number: '1.1-1' }} from
              {{ book.ratingSummary.count }})
            </span>
          }
        </h2>
        <ul class="mt-3 space-y-2">
          @for (entry of communityPage(); track entry.userId) {
            <li class="flex items-center gap-3 text-sm">
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

      <dialog #deleteDialog class="rounded-md border border-border p-6">
        <p>
          This moves <strong>{{ book.title }}</strong> to the trash. Anyone can restore it.
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
      <p class="text-ink-muted">This book could not be found.</p>
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
