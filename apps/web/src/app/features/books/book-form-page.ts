import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule, type MatSelectChange } from '@angular/material/select';
import { debounceTime, firstValueFrom } from 'rxjs';
import {
  RELEASE_PRECISIONS,
  type BookDetail,
  type ListResponse,
  type ReleasePrecision,
  type SeriesSummary,
} from '@books/domain';
import { Flash } from '../../core/flash';
import { readSaveConflict } from '../../core/save-conflict';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
import { looksLikeAmazonProductPaste, parseAmazonPaste } from './amazon-paste-parser';
import { AuthorsInput } from './authors-input';
import { BooksApi } from './books-api';

/**
 * `[formField]` on a plain native `<input>`/`<textarea>` only accepts a
 * non-nullable `string` — confirmed the hard way, by the Angular compiler
 * rejecting `WritableSignal<string | null>` bindings on every text field below
 * until this was changed. `''` stands in for "not set" everywhere here; the
 * boundary back to `string | null` for `BookCreate`/`BookUpdate` happens once,
 * in `toApiInput()`, not scattered across every field. (`releaseDate`, a native
 * `<input type="date">`, and `seriesId`/`authors`, bound to components that
 * implement `FormValueControl` themselves, are the exceptions — those accept
 * `null` directly.)
 */
export interface BookFormModel {
  title: string;
  subtitle: string;
  description: string;
  authors: string[];
  seriesId: string | null;
  seriesPosition: string;
  releaseDate: string | null;
  releasePrecision: ReleasePrecision;
  pageCount: number | null;
  asin: string;
  coverUrl: string;
}

const BLANK_MODEL: BookFormModel = {
  title: '',
  subtitle: '',
  description: '',
  authors: [],
  seriesId: null,
  seriesPosition: '',
  releaseDate: null,
  releasePrecision: 'unknown',
  pageCount: null,
  asin: '',
  coverUrl: '',
};

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

/** The bare enum values (`day`, `unknown`, ...) are storage names, not labels a
 *  member should have to interpret in a `<select>`. */
const PRECISION_LABELS: Record<ReleasePrecision, string> = {
  day: 'Exact day',
  month: 'Month only',
  year: 'Year only',
  unknown: 'Unknown / not announced',
};

@Component({
  selector: 'app-book-form-page',
  imports: [
    RouterLink,
    AuthorsInput,
    AppCombobox,
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h1>{{ id() ? 'Edit book' : 'Add a book' }}</h1>

    @if (conflictMessage(); as message) {
      <div class="conflict-banner">
        <p class="conflict-message">{{ message }}</p>
        <div class="conflict-actions">
          @if (id(); as bookId) {
            <a [routerLink]="['/books', bookId, 'history']">Review the changes</a>
          }
          <button type="button" class="link-btn" (click)="reloadAndDiscardMyChanges()">
            Reload and discard my changes
          </button>
        </div>
      </div>
    }

    <form (submit)="onSubmit($event)" (paste)="onPaste($event)" class="form">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Title</mat-label>
        <input matInput id="title" type="text" [formField]="bookForm.title" />
      </mat-form-field>
      @for (error of bookForm.title().errors(); track error.kind) {
        <p class="field-error">{{ error.message }}</p>
      }

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Subtitle</mat-label>
        <input matInput id="subtitle" type="text" [formField]="bookForm.subtitle" />
      </mat-form-field>

      <div class="field-group">
        <span class="field-label">Authors</span>
        <app-authors-input [formField]="bookForm.authors" label="Authors" />
      </div>

      <div class="field-group">
        <label for="series" class="field-label">Series</label>
        <app-combobox
          inputId="series"
          placeholder="Search for a series"
          ariaLabel="Series"
          [formField]="bookForm.seriesId"
          [options]="seriesOptions()"
          [loading]="seriesResource.isLoading()"
          [queryText]="seriesQuery()"
          (queryTextChange)="seriesQuery.set($event)"
        />
      </div>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Position in series</mat-label>
        <input
          matInput
          id="seriesPosition"
          type="text"
          [formField]="bookForm.seriesPosition"
          placeholder="e.g. 1 or 1.5"
        />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Release date</mat-label>
        <input
          #releaseDateInput
          matInput
          id="releaseDate"
          type="date"
          [value]="bookForm.releaseDate().value() ?? ''"
          (input)="setReleaseDate(releaseDateInput.value)"
          aria-describedby="releaseDateHint"
        />
        <mat-hint id="releaseDateHint">Leave blank if it hasn't been announced yet.</mat-hint>
      </mat-form-field>
      @for (error of bookForm.releaseDate().errors(); track error.kind) {
        <p class="field-error">{{ error.message }}</p>
      }

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>How precise is this date?</mat-label>
        <mat-select
          id="releasePrecision"
          [value]="bookForm.releasePrecision().value()"
          (selectionChange)="setPrecision($event)"
        >
          @for (precision of precisions; track precision.value) {
            <mat-option [value]="precision.value">{{ precision.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Page count</mat-label>
        <input
          #pageCountInput
          matInput
          id="pageCount"
          type="number"
          min="1"
          [value]="bookForm.pageCount().value() ?? ''"
          (input)="setPageCount(pageCountInput.value)"
        />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>ASIN</mat-label>
        <input matInput id="asin" type="text" [formField]="bookForm.asin" />
      </mat-form-field>
      @for (error of bookForm.asin().errors(); track error.kind) {
        <p class="field-error">{{ error.message }}</p>
      }

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Cover URL</mat-label>
        <input matInput id="coverUrl" type="text" [formField]="bookForm.coverUrl" />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Description</mat-label>
        <textarea matInput id="description" [formField]="bookForm.description" rows="4"></textarea>
      </mat-form-field>

      @if (formError(); as message) {
        <p class="field-error">{{ message }}</p>
      }

      <button mat-flat-button type="submit" [disabled]="bookForm().submitting()">
        {{ id() ? 'Save changes' : 'Add book' }}
      </button>
    </form>
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .conflict-banner {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid var(--status-dropped-on-container);
      border-radius: 8px;
      background: var(--status-dropped-container);
    }

    .conflict-message {
      color: var(--status-dropped-on-container);
      margin: 0;
    }

    .conflict-actions {
      display: flex;
      gap: 0.75rem;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    a {
      color: var(--mat-sys-primary);
    }

    .link-btn {
      color: var(--mat-sys-primary);
      text-decoration: underline;
      background: none;
      border: none;
      cursor: pointer;
      font: inherit;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 1.5rem;
      max-width: 32rem;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
    }

    .field-label {
      font-size: 0.875rem;
      font-weight: 600;
    }

    .field-error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
      margin: -0.25rem 0 0.5rem;
    }
  `,
})
export class BookFormPage {
  readonly id = input<string>();

  private readonly booksApi = inject(BooksApi);
  private readonly router = inject(Router);
  private readonly flash = inject(Flash);

  protected readonly precisions = RELEASE_PRECISIONS.map((value) => ({
    value,
    label: PRECISION_LABELS[value],
  }));
  // Not `protected`: `book-form-page.spec.ts` drives Signal Forms state
  // (`bookForm`, `model`, `loadedVersion`, `conflictMessage`) directly, since
  // asserting on `field().valid()`/`hidden()` is how this phase's Signal Forms
  // wiring actually gets verified — a DOM-only test would only prove the
  // template compiles, not that the schema's cross-field rules behave.
  readonly model = signal<BookFormModel>({ ...BLANK_MODEL });
  readonly loadedVersion = signal<number | null>(null);
  readonly conflictMessage = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly seriesQuery = signal('');
  // Debounced for the same reason `createListStore` debounces its filters: this
  // fires on every keystroke, and one request per character is both wasteful and
  // the thing that made the option array churn hardest.
  private readonly debouncedSeriesQuery = toSignal(
    toObservable(this.seriesQuery).pipe(debounceTime(250)),
    { initialValue: '' },
  );
  protected readonly seriesResource = httpResource<ListResponse<SeriesSummary>>(
    () => ({ url: '/api/v1/series', params: { q: this.debouncedSeriesQuery(), pageSize: 10 } }),
    { defaultValue: { items: [], page: 1, pageSize: 10, total: 0 } },
  );
  private readonly seriesItems = computed<SeriesSummary[]>(() =>
    this.seriesResource.hasValue() ? this.seriesResource.value().items : [],
  );
  // The previous results stay on screen while the next request is in flight —
  // `defaultValue` is an empty page, so without this the popup blanks to "No
  // matches." between every keystroke and its result. Same shape as the
  // `displayItems` `linkedSignal` in `core/list-store.ts`.
  private readonly displaySeries = linkedSignal<
    { items: SeriesSummary[]; loading: boolean },
    SeriesSummary[]
  >({
    source: () => ({ items: this.seriesItems(), loading: this.seriesResource.isLoading() }),
    computation: (source, previous) => (source.loading && previous ? previous.value : source.items),
  });
  protected readonly seriesOptions = computed<ComboboxOption[]>(() =>
    this.displaySeries().map((s) => ({ id: s.id, label: s.name })),
  );

  readonly existing = httpResource<BookDetail>(() =>
    this.id() ? `/api/v1/books/${this.id()}` : undefined,
  );

  readonly bookForm = form(this.model, (p) => {
    required(p.title, { message: 'Title is required.' });
    required(p.releaseDate, {
      when: (ctx) => ctx.valueOf(p.releasePrecision) !== 'unknown',
      message: 'A release date is required unless the precision is unknown.',
    });
    validate(p.asin, ({ value }) => {
      const asin = value();
      if (asin === '') return undefined;
      return ASIN_PATTERN.test(asin)
        ? undefined
        : { kind: 'pattern', message: 'Must be a 10-character ASIN.' };
    });
  });

  constructor() {
    // Seed the model from the loaded book exactly once — re-running this on
    // every re-fetch (e.g. after a background reload) would clobber whatever
    // the member is mid-way through typing.
    effect(() => {
      if (!this.existing.hasValue()) return;
      if (this.loadedVersion() !== null) return;
      const book = this.existing.value();
      untracked(() => {
        this.model.set({
          title: book.title,
          subtitle: book.subtitle ?? '',
          description: book.description ?? '',
          authors: book.authors.map((a) => a.name),
          seriesId: book.seriesId,
          seriesPosition: book.seriesPosition ?? '',
          releaseDate: book.releaseDate,
          releasePrecision: book.releasePrecision,
          pageCount: book.pageCount,
          asin: book.asin ?? '',
          coverUrl: book.coverUrl ?? '',
        });
        this.loadedVersion.set(book.version);
      });
    });
  }

  /**
   * `releaseDate` and `releasePrecision` are not independent: the database
   * enforces `(precision = 'unknown') = (release_date IS NULL)`
   * (`books_release_precision_date_agree`), so any state where one is set
   * without the other is a 500 waiting to happen on save. These two handlers
   * are the only writers, and each keeps the pair in agreement — which is also
   * what lets the date input stay visible unconditionally, rather than hiding
   * behind a precision the member has to discover and change first.
   */
  protected setReleaseDate(raw: string): void {
    if (raw === '') {
      this.bookForm.releaseDate().value.set(null);
      this.bookForm.releasePrecision().value.set('unknown');
      return;
    }
    this.bookForm.releaseDate().value.set(raw);
    if (this.bookForm.releasePrecision().value() === 'unknown') {
      this.bookForm.releasePrecision().value.set('day');
    }
  }

  protected setPrecision(event: MatSelectChange): void {
    const precision = event.value as ReleasePrecision;
    this.bookForm.releasePrecision().value.set(precision);
    if (precision === 'unknown') this.bookForm.releaseDate().value.set(null);
  }

  protected setPageCount(raw: string): void {
    this.bookForm.pageCount().value.set(raw === '' ? null : Number(raw));
  }

  /**
   * `releaseDate` is documented as "always the earliest date consistent with
   * `releasePrecision`" (`@books/domain`'s `book.ts`, and the column comment in
   * `packages/db/src/schema/books.ts`), and nothing on the server enforces it —
   * the seed data just hand-writes `-01` day parts. An `<input type="date">`
   * can only ever hand back a full day, so "June 2027" arrives here as some
   * arbitrary June day; truncating it is what makes the stored value mean what
   * the precision claims.
   */
  private normalizeReleaseDate(date: string | null, precision: ReleasePrecision): string | null {
    if (date === null || precision === 'unknown') return null;
    if (precision === 'month') return `${date.slice(0, 7)}-01`;
    if (precision === 'year') return `${date.slice(0, 4)}-01-01`;
    return date;
  }

  /** The one place `''` (this form's "not set") turns back into `null` (the
   *  API's) — see the note on `BookFormModel`. */
  private toApiInput(model: BookFormModel) {
    return {
      title: model.title,
      subtitle: model.subtitle === '' ? null : model.subtitle,
      description: model.description === '' ? null : model.description,
      authors: model.authors,
      seriesId: model.seriesId,
      seriesPosition: model.seriesPosition === '' ? null : model.seriesPosition,
      releaseDate: this.normalizeReleaseDate(model.releaseDate, model.releasePrecision),
      releasePrecision: model.releasePrecision,
      pageCount: model.pageCount,
      asin: model.asin === '' ? null : model.asin,
      coverUrl: model.coverUrl === '' ? null : model.coverUrl,
    };
  }

  /**
   * A page-level listener rather than a dedicated paste box, so a member can
   * paste a copied Amazon listing anywhere on the form. `looksLikeAmazonProductPaste`
   * is what keeps this from hijacking an ordinary paste into a single field
   * (a title, a URL, an ASIN) — only a payload that scores as a bulk product
   * dump gets intercepted; everything else falls through to default paste
   * behavior untouched.
   */
  protected onPaste(event: ClipboardEvent): void {
    const html = event.clipboardData?.getData('text/html') ?? '';
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!looksLikeAmazonProductPaste(html, text)) return;
    event.preventDefault();

    const result = parseAmazonPaste(html, text);
    if (result.matchedFieldCount === 0) return;
    this.model.update((m) => ({ ...m, ...result.fields }));
    this.flash.show(`Auto-filled ${result.matchedFieldCount} field(s) from pasted content.`);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.bookForm, async () => {
      this.formError.set(null);
      this.conflictMessage.set(null);
      try {
        const input = this.toApiInput(this.model());
        const bookId = this.id();
        if (bookId === undefined) {
          const created = await firstValueFrom(this.booksApi.create(input));
          await this.router.navigate(['/books', created.id]);
        } else {
          const version = this.loadedVersion();
          if (version === null) return undefined; // still loading — submit shouldn't be reachable yet
          const updated = await firstValueFrom(
            this.booksApi.update(bookId, { ...input, expectedVersion: version }),
          );
          await this.router.navigate(['/books', updated.id]);
        }
        return undefined;
      } catch (err) {
        if (err instanceof HttpErrorResponse) {
          const conflict = readSaveConflict(err);
          if (conflict) {
            this.conflictMessage.set(
              'Someone else edited this book while you were working — review the changes.',
            );
            return undefined;
          }
        }
        this.formError.set('Could not save this book — please try again.');
        return undefined;
      }
    });
  }

  reloadAndDiscardMyChanges(): void {
    this.loadedVersion.set(null);
    this.conflictMessage.set(null);
    this.existing.reload();
  }
}
