import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookFormPage } from './book-form-page';

const EMPTY_SERIES = { items: [], page: 1, pageSize: 10, total: 0 };

const BOOK_DETAIL = {
  id: 'book-1',
  title: 'Leviathan Wakes',
  subtitle: null,
  description: null,
  authors: [{ id: 'a1', name: 'James S. A. Corey' }],
  seriesId: null,
  seriesPosition: null,
  releaseDate: '2011-06-15',
  releasePrecision: 'day',
  pageCount: null,
  asin: null,
  coverUrl: null,
  version: 3,
  deletedAt: null,
  deletedBy: null,
  myStatus: null,
  statuses: [],
  ratingSummary: { average: null, count: 0, distribution: [] },
};

describe('BookFormPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The series combobox's own httpResource fires on every render regardless
    // of what a given test cares about — drain it before asserting nothing
    // else is outstanding.
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    httpMock.verify({ ignoreCancelled: true });
  });

  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    TestBed.tick();
  }

  it('requires a title', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    expect(fixture.componentInstance.bookForm.title().valid()).toBe(false);
    fixture.componentInstance.model.update((m) => ({ ...m, title: 'A Title' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.title().valid()).toBe(true);
  });

  it('requires a release date once a precision other than unknown is chosen, and hides it when unknown', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    expect(fixture.componentInstance.bookForm.releaseDate().hidden()).toBe(true);

    fixture.componentInstance.model.update((m) => ({ ...m, releasePrecision: 'year' }));
    TestBed.tick();

    expect(fixture.componentInstance.bookForm.releaseDate().hidden()).toBe(false);
    expect(fixture.componentInstance.bookForm.releaseDate().required()).toBe(true);
    expect(fixture.componentInstance.bookForm.releaseDate().valid()).toBe(false);

    fixture.componentInstance.model.update((m) => ({ ...m, releaseDate: '2027-01-01' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.releaseDate().valid()).toBe(true);
  });

  it('rejects an ASIN that is not 10 characters', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    fixture.componentInstance.model.update((m) => ({ ...m, asin: 'short' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.asin().valid()).toBe(false);

    fixture.componentInstance.model.update((m) => ({ ...m, asin: '0316129089' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.asin().valid()).toBe(true);
  });

  it('seeds the model from the loaded book exactly once in edit mode', async () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.componentRef.setInput('id', 'book-1');
    fixture.detectChanges();
    TestBed.tick();

    httpMock.expectOne((r) => r.url === '/api/v1/books/book-1').flush(BOOK_DETAIL);
    await settle(fixture);
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));

    expect(fixture.componentInstance.model().title).toBe('Leviathan Wakes');
    expect(fixture.componentInstance.loadedVersion()).toBe(3);

    // A member's in-progress edit must not be clobbered by a background re-fetch.
    fixture.componentInstance.model.update((m) => ({ ...m, title: 'Edited title' }));
    fixture.componentInstance.existing.reload();
    await settle(fixture);
    httpMock.expectOne((r) => r.url === '/api/v1/books/book-1').flush(BOOK_DETAIL);
    await settle(fixture);
    expect(fixture.componentInstance.model().title).toBe('Edited title');
  });

  it('shows the conflict banner on a 409, and keeps the typed model', async () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.componentRef.setInput('id', 'book-1');
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books/book-1').flush(BOOK_DETAIL);
    await settle(fixture);
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    await settle(fixture);

    fixture.componentInstance.model.update((m) => ({ ...m, title: 'My Edit' }));
    fixture.componentInstance.onSubmit(new Event('submit'));
    await settle(fixture);

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books/book-1' && r.method === 'PATCH');
    req.flush(
      {
        error: {
          code: 'conflict',
          message: 'stale',
          details: { reason: 'stale_version', currentVersion: 4 },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);
    await settle(fixture);

    expect(fixture.componentInstance.conflictMessage()).toContain('Someone else edited');
    expect(fixture.componentInstance.model().title).toBe('My Edit');
  });
});
