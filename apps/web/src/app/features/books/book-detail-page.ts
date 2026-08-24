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
import {
  formatReleaseDate,
  type AuthorRef,
  type BookCommunityStatus,
  type BookDetail,
  type BookStatus,
} from '@books/domain';
import { AuthStore } from '../../core/auth-store';
import { Flash } from '../../core/flash';
import { BookCover } from '../../shared/ui/book-cover';
import { Chip } from '../../shared/ui/chip';
import { Pagination } from '../../shared/ui/pagination';
import { PercentSlider } from '../../shared/ui/percent-slider';
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
    PercentSlider,
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
          @if (book.seriesSlug) {
            <p class="series">
              <a [routerLink]="['/series', book.seriesSlug]">{{ book.seriesName ?? 'Series' }}</a>
              @if (book.seriesPosition) {
                — #{{ book.seriesPosition }}
              }
            </p>
          }
          <p class="muted release-date">
            {{ formatReleaseDate(book.releaseDate, book.releasePrecision) }}
          </p>
          @if (book.url) {
            <p class="external-link">
              <a [href]="book.url" target="_blank" rel="noopener noreferrer">View book ↗</a>
            </p>
          }
          @if (book.description) {
            <p class="description">{{ book.description }}</p>
          }

          <p class="muted version">
            Version {{ book.version }} ·
            <a [routerLink]="['/books', book.slug, 'history']">History</a>
          </p>

          <div class="actions">
            <a mat-stroked-button [routerLink]="['/books', book.slug, 'edit']">Edit</a>
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
        <div class="section-row">
          <app-percent-slider [value]="myPercentRead()" (valueChange)="setPercentRead($event)" />
        </div>
        <div class="section-row note-field">
          <label for="public-note">Public note</label>
          <textarea
            id="public-note"
            class="note-input"
            [value]="myPublicNote() ?? ''"
            (input)="onPublicNoteInput($event)"
          ></textarea>
        </div>
        <div class="section-row note-field">
          <label for="private-note">Personal note (only you can see this)</label>
          <textarea
            id="private-note"
            class="note-input"
            [value]="myNote() ?? ''"
            (input)="onNoteInput($event)"
          ></textarea>
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
              <div class="community-row-summary">
                <strong>{{ entry.username }}</strong>
                <app-chip [label]="entry.status" [tone]="entry.status" />
                @if (entry.rating !== null) {
                  <span>Rated {{ entry.rating }}/10</span>
                }
                @if (entry.percentRead !== null) {
                  <span>{{ entry.percentRead }}% read</span>
                }
              </div>
              @if (entry.publicNote) {
                <p class="public-note">{{ entry.publicNote }}</p>
              }
            </li>
          }
        </ul>
        <app-pagination
          [page]="communityPageIndex()"
          [pageSize]="communityPageSize"
          [total]="mergedStatuses().length"
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

    .external-link {
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .description {
      margin-top: 1rem;
      white-space: pre-line;
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
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
    }

    .community-row-summary {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .public-note {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .note-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-width: 480px;
    }

    .note-input {
      font: inherit;
      padding: 0.5rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 4px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      resize: vertical;
      min-height: 3rem;
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
  readonly slug = input.required<string>();

  private readonly booksApi = inject(BooksApi);
  private readonly shelfApi = inject(ShelfApi);
  private readonly flash = inject(Flash);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);

  protected readonly deleteDialog = viewChild.required<HTMLDialogElement>('deleteDialog');

  protected readonly detail = httpResource<BookDetail>(() => `/api/v1/books/${this.slug()}`);

  protected readonly formatReleaseDate = formatReleaseDate;

  protected readonly myStatus = linkedSignal<BookStatus | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.status ?? null) : null,
  );
  protected readonly myRating = linkedSignal<number | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.rating ?? null) : null,
  );
  protected readonly myPercentRead = linkedSignal<number | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.percentRead ?? null) : null,
  );
  protected readonly myNote = linkedSignal<string | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.note ?? null) : null,
  );
  protected readonly myPublicNote = linkedSignal<string | null>(() =>
    this.detail.hasValue() ? (this.detail.value().myStatus?.publicNote ?? null) : null,
  );

  /**
   * The server's last-acknowledged values — separate from `myStatus`/`myRating`/
   * etc., which flip immediately on every edit for instant feedback. Rolling a
   * failed save back to "whatever was set just before this one" would still be
   * wrong mid-burst; rolling back to the last value the server actually confirmed
   * is the only value that's still true after several optimistic updates in a row.
   */
  private confirmedStatus: BookStatus | null = null;
  private confirmedRating: number | null = null;
  private confirmedPercentRead: number | null = null;
  private confirmedNote: string | null = null;
  private confirmedPublicNote: string | null = null;
  private hasSeededConfirmed = false;

  private readonly statusChanges = new Subject<BookStatus | null>();
  private readonly ratingChanges = new Subject<number | null>();
  private readonly percentReadChanges = new Subject<number | null>();
  private readonly noteChanges = new Subject<string | null>();
  private readonly publicNoteChanges = new Subject<string | null>();

  protected readonly communityPageIndex = signal(1);
  protected readonly communityPageSize = COMMUNITY_PAGE_SIZE;

  /**
   * What the viewer's own row in "Everyone's take" looks like right now, built
   * from the same optimistic signals as "Your shelf" rather than from the
   * server-fetched `statuses` — otherwise a shelf edit would only reach the
   * community list on a full reload. `null` status means no shelf entry, so
   * nothing to show there. Only public fields go in; `note` never does.
   */
  private readonly myCommunityEntry = computed<BookCommunityStatus | null>(() => {
    const status = this.myStatus();
    const me = this.authStore.user();
    if (status === null || me === null || !this.detail.hasValue()) return null;
    const book = this.detail.value();
    const existing = book.statuses.find((s) => s.userId === me.id);
    return {
      bookId: book.id,
      userId: me.id,
      username: me.username,
      status,
      rating: this.myRating(),
      percentRead: this.myPercentRead(),
      publicNote: this.myPublicNote(),
      startedAt: existing?.startedAt ?? null,
      finishedAt: existing?.finishedAt ?? null,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    };
  });

  /** `detail.value().statuses` with the viewer's own row replaced (or added, or
   *  removed) by `myCommunityEntry` — see its comment for why. */
  protected readonly mergedStatuses = computed<BookCommunityStatus[]>(() => {
    if (!this.detail.hasValue()) return [];
    const base = this.detail.value().statuses;
    const me = this.authStore.user();
    if (me === null) return base;
    const mine = this.myCommunityEntry();
    const withoutMine = base.filter((s) => s.userId !== me.id);
    return mine === null ? withoutMine : [...withoutMine, mine];
  });

  protected readonly communityPage = computed(() => {
    const start = (this.communityPageIndex() - 1) * COMMUNITY_PAGE_SIZE;
    return this.mergedStatuses().slice(start, start + COMMUNITY_PAGE_SIZE);
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
        this.confirmedPercentRead = status?.percentRead ?? null;
        this.confirmedNote = status?.note ?? null;
        this.confirmedPublicNote = status?.publicNote ?? null;
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
        this.shelfApi.remove(this.slug()).subscribe({
          next: () => {
            this.confirmedStatus = null;
            this.confirmedRating = null;
            this.myRating.set(null);
            this.confirmedPercentRead = null;
            this.myPercentRead.set(null);
            this.confirmedNote = null;
            this.myNote.set(null);
            this.confirmedPublicNote = null;
            this.myPublicNote.set(null);
          },
          error: onError,
        });
      } else {
        this.shelfApi.update(this.slug(), { status }).subscribe({
          next: (updated) => {
            this.confirmedStatus = status;
            // Marking a book completed forces `percentRead` to 100 server-side —
            // reflect that back without waiting for a reload. Every other status
            // leaves `percentRead` untouched, so this is a no-op for those.
            this.confirmedPercentRead = updated.percentRead;
            this.myPercentRead.set(updated.percentRead);
          },
          error: onError,
        });
      }
    });

    this.ratingChanges.pipe(debounceTime(600), takeUntilDestroyed()).subscribe((rating) => {
      this.shelfApi.update(this.slug(), { rating }).subscribe({
        next: () => {
          this.confirmedRating = rating;
        },
        error: () => {
          this.myRating.set(this.confirmedRating);
          this.flash.show('Could not update your rating — please try again.');
        },
      });
    });

    this.percentReadChanges
      .pipe(debounceTime(600), takeUntilDestroyed())
      .subscribe((percentRead) => {
        this.shelfApi.update(this.slug(), { percentRead }).subscribe({
          next: () => {
            this.confirmedPercentRead = percentRead;
          },
          error: () => {
            this.myPercentRead.set(this.confirmedPercentRead);
            this.flash.show('Could not update your progress — please try again.');
          },
        });
      });

    this.noteChanges.pipe(debounceTime(600), takeUntilDestroyed()).subscribe((note) => {
      this.shelfApi.update(this.slug(), { note }).subscribe({
        next: () => {
          this.confirmedNote = note;
        },
        error: () => {
          this.myNote.set(this.confirmedNote);
          this.flash.show('Could not save your note — please try again.');
        },
      });
    });

    this.publicNoteChanges.pipe(debounceTime(600), takeUntilDestroyed()).subscribe((publicNote) => {
      this.shelfApi.update(this.slug(), { publicNote }).subscribe({
        next: () => {
          this.confirmedPublicNote = publicNote;
        },
        error: () => {
          this.myPublicNote.set(this.confirmedPublicNote);
          this.flash.show('Could not save your note — please try again.');
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

  protected setPercentRead(percentRead: number | null): void {
    this.myPercentRead.set(percentRead);
    this.percentReadChanges.next(percentRead);
  }

  protected setNote(note: string | null): void {
    this.myNote.set(note);
    this.noteChanges.next(note);
  }

  protected setPublicNote(publicNote: string | null): void {
    this.myPublicNote.set(publicNote);
    this.publicNoteChanges.next(publicNote);
  }

  protected onNoteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.setNote(value === '' ? null : value);
  }

  protected onPublicNoteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.setPublicNote(value === '' ? null : value);
  }

  protected confirmDelete(): void {
    const title = this.detail.hasValue() ? this.detail.value().title : 'This book';
    const slug = this.slug();
    this.deleteDialog().close();
    this.booksApi.delete(slug).subscribe({
      next: () => {
        this.flash.show(`"${title}" moved to the trash.`, () => {
          this.booksApi.restore(slug).subscribe();
        });
        void this.router.navigate(['/books']);
      },
      error: () => {
        this.flash.show('Could not delete this book — please try again.');
      },
    });
  }

  protected restore(): void {
    this.booksApi.restore(this.slug()).subscribe({
      next: () => this.detail.reload(),
      error: () => this.flash.show('Could not restore this book — please try again.'),
    });
  }
}
