import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, hidden, required, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import {
  RELEASE_PRECISIONS,
  type BookDetail,
  type ListResponse,
  type ReleasePrecision,
  type SeriesSummary,
} from '@books/domain';
import { readSaveConflict } from '../../core/save-conflict';
import { AppCombobox, type ComboboxOption } from '../../shared/ui/combobox';
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
interface BookFormModel {
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

@Component({
  selector: 'app-book-form-page',
  imports: [RouterLink, AuthorsInput, AppCombobox, FormField],
  template: `
    <h1 class="text-2xl font-semibold">{{ id() ? 'Edit book' : 'Add a book' }}</h1>

    @if (conflictMessage(); as message) {
      <div class="mt-4 rounded-md border border-status-dropped-fg/40 bg-status-dropped-bg p-4">
        <p class="text-status-dropped-fg">{{ message }}</p>
        <div class="mt-2 flex gap-3 text-sm">
          @if (id(); as bookId) {
            <a [routerLink]="['/books', bookId, 'history']" class="underline">Review the changes</a>
          }
          <button type="button" class="underline" (click)="reloadAndDiscardMyChanges()">
            Reload and discard my changes
          </button>
        </div>
      </div>
    }

    <form (submit)="onSubmit($event)" class="mt-6 space-y-4">
      <div>
        <label for="title" class="block text-sm font-medium">Title</label>
        <input
          id="title"
          type="text"
          [formField]="bookForm.title"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
        @for (error of bookForm.title().errors(); track error.kind) {
          <p class="mt-1 text-sm text-status-dropped-fg">{{ error.message }}</p>
        }
      </div>

      <div>
        <label for="subtitle" class="block text-sm font-medium">Subtitle</label>
        <input
          id="subtitle"
          type="text"
          [formField]="bookForm.subtitle"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
      </div>

      <div>
        <span class="block text-sm font-medium">Authors</span>
        <app-authors-input class="mt-1 block" [formField]="bookForm.authors" label="Authors" />
      </div>

      <div>
        <label for="series" class="block text-sm font-medium">Series</label>
        <app-combobox
          id="series"
          class="mt-1 block"
          placeholder="Search for a series"
          ariaLabel="Series"
          [formField]="bookForm.seriesId"
          [options]="seriesOptions()"
          [queryText]="seriesQuery()"
          (queryTextChange)="seriesQuery.set($event)"
        />
      </div>

      <div>
        <label for="seriesPosition" class="block text-sm font-medium">Position in series</label>
        <input
          id="seriesPosition"
          type="text"
          [formField]="bookForm.seriesPosition"
          placeholder="e.g. 1 or 1.5"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
      </div>

      <div>
        <label for="releasePrecision" class="block text-sm font-medium"
          >Release date precision</label
        >
        <select
          #precisionSelect
          id="releasePrecision"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
          [value]="bookForm.releasePrecision().value()"
          (change)="setPrecision(precisionSelect.value)"
        >
          @for (precision of precisions; track precision) {
            <option [value]="precision">{{ precision }}</option>
          }
        </select>
      </div>

      @if (!bookForm.releaseDate().hidden()) {
        <div>
          <label for="releaseDate" class="block text-sm font-medium">Release date</label>
          <input
            id="releaseDate"
            type="date"
            [formField]="bookForm.releaseDate"
            class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
          />
          @for (error of bookForm.releaseDate().errors(); track error.kind) {
            <p class="mt-1 text-sm text-status-dropped-fg">{{ error.message }}</p>
          }
        </div>
      }

      <div>
        <label for="pageCount" class="block text-sm font-medium">Page count</label>
        <input
          #pageCountInput
          id="pageCount"
          type="number"
          min="1"
          [value]="bookForm.pageCount().value() ?? ''"
          (input)="setPageCount(pageCountInput.value)"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
      </div>

      <div>
        <label for="asin" class="block text-sm font-medium">ASIN</label>
        <input
          id="asin"
          type="text"
          [formField]="bookForm.asin"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
        @for (error of bookForm.asin().errors(); track error.kind) {
          <p class="mt-1 text-sm text-status-dropped-fg">{{ error.message }}</p>
        }
      </div>

      <div>
        <label for="coverUrl" class="block text-sm font-medium">Cover URL</label>
        <input
          id="coverUrl"
          type="text"
          [formField]="bookForm.coverUrl"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
      </div>

      <div>
        <label for="description" class="block text-sm font-medium">Description</label>
        <textarea
          id="description"
          [formField]="bookForm.description"
          rows="4"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        ></textarea>
      </div>

      @if (formError(); as message) {
        <p class="text-sm text-status-dropped-fg">{{ message }}</p>
      }

      <button
        type="submit"
        [disabled]="bookForm().submitting()"
        class="rounded-sm border border-border px-4 py-2"
      >
        {{ id() ? 'Save changes' : 'Add book' }}
      </button>
    </form>
  `,
})
export class BookFormPage {
  readonly id = input<string>();

  private readonly booksApi = inject(BooksApi);
  private readonly router = inject(Router);

  protected readonly precisions = RELEASE_PRECISIONS;
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
  private readonly seriesResource = httpResource<ListResponse<SeriesSummary>>(
    () => ({ url: '/api/v1/series', params: { q: this.seriesQuery(), pageSize: 10 } }),
    { defaultValue: { items: [], page: 1, pageSize: 10, total: 0 } },
  );
  protected readonly seriesOptions = computed<ComboboxOption[]>(() =>
    (this.seriesResource.hasValue() ? this.seriesResource.value().items : []).map((s) => ({
      id: s.id,
      label: s.name,
    })),
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
    hidden(p.releaseDate, { when: (ctx) => ctx.valueOf(p.releasePrecision) === 'unknown' });
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

  protected setPrecision(value: string): void {
    this.bookForm.releasePrecision().value.set(value as ReleasePrecision);
  }

  protected setPageCount(raw: string): void {
    this.bookForm.pageCount().value.set(raw === '' ? null : Number(raw));
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
      releaseDate: model.releaseDate,
      releasePrecision: model.releasePrecision,
      pageCount: model.pageCount,
      asin: model.asin === '' ? null : model.asin,
      coverUrl: model.coverUrl === '' ? null : model.coverUrl,
    };
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
