import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideRouter } from '@angular/router';
import { Flash } from '../../core/flash';
import { BookFormPage } from './book-form-page';

const REAL_LISTING_PASTE = `Hell Difficulty Tutorial: A LitRPG Adventure
by Cerim (Author) Format: Kindle Edition
4.5 4.5 out of 5 stars (7,156)
4.1 on Goodreads
5,559 ratings
Book 1 of 9: Hell Difficulty Tutorial
See all languages and editions
Where others see doom, he sees opportunity. Hell Difficulty? More like a chance to thrive.

Nathaniel's bus ride was supposed to be just another boring commute. Wrong.
Read more

    Book 1 of 9
    Hell Difficulty Tutorial
    Print length
    618 pages
    Publication date
    May 14, 2024
    Language
    English

Next slide of product details
See all details`;

/** `ClipboardEvent`'s constructor won't accept `clipboardData` in every test
 *  environment, and the property is read-only on a real event — defining it
 *  after construction sidesteps both. */
function pasteEvent(text: string, html = ''): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/html' ? html : text) },
  });
  return event;
}

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
  url: 'https://example.com/book',
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

  it('requires a release date once a precision other than unknown is chosen', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    fixture.componentInstance.model.update((m) => ({ ...m, releasePrecision: 'year' }));
    TestBed.tick();

    expect(fixture.componentInstance.bookForm.releaseDate().required()).toBe(true);
    expect(fixture.componentInstance.bookForm.releaseDate().valid()).toBe(false);

    fixture.componentInstance.model.update((m) => ({ ...m, releaseDate: '2027-01-01' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.releaseDate().valid()).toBe(true);
  });

  // The reported bug: the precision `<select>` rendered "day" (its first
  // `<option>`, because a `[value]` property binding on a `<select>` is applied
  // before its options exist) while the model held `unknown`, which hid the
  // date input — so the form showed a precision it wasn't using and offered no
  // way to enter a date at all.
  it('shows a date input on a blank form, with the precision select agreeing with the model', async () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input#releaseDate')).toBeTruthy();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);
    expect(await select.getValueText()).toBe('Unknown / not announced');
  });

  it('derives the precision from the date, and clears the date when precision goes unknown', async () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));

    const el = fixture.nativeElement as HTMLElement;
    const dateInput = el.querySelector<HTMLInputElement>('input#releaseDate')!;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);

    dateInput.value = '2027-06-15';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().releaseDate).toBe('2027-06-15');
    expect(fixture.componentInstance.model().releasePrecision).toBe('day');
    expect(await select.getValueText()).toBe('Exact day');

    // The database's `books_release_precision_date_agree` check rejects either
    // half of the pair without the other, so both handlers must keep them in step.
    await select.clickOptions({ text: 'Unknown / not announced' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().releaseDate).toBeNull();

    dateInput.value = '2027-06-15';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    dateInput.value = '';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    expect(fixture.componentInstance.model().releaseDate).toBeNull();
    expect(fixture.componentInstance.model().releasePrecision).toBe('unknown');
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

  it('rejects a book URL with no http(s) scheme', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    fixture.componentInstance.model.update((m) => ({ ...m, url: 'ftp://example.com/book' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.url().valid()).toBe(false);

    fixture.componentInstance.model.update((m) => ({ ...m, url: 'https://example.com/book' }));
    TestBed.tick();
    expect(fixture.componentInstance.bookForm.url().valid()).toBe(true);
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
    expect(fixture.componentInstance.model().url).toBe('https://example.com/book');
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

  it('autofills fields from a pasted Amazon listing without clobbering fields already typed', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    // coverUrl is a field the parser targets but can't find in a plain-text
    // paste (no HTML) — pre-setting it here proves fields it doesn't match
    // are left alone, not just that matched fields get applied.
    fixture.componentInstance.model.update((m) => ({
      ...m,
      coverUrl: 'https://example.com/cover.jpg',
    }));

    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    const flash = TestBed.inject(Flash);
    vi.spyOn(flash, 'show');

    const event = pasteEvent(REAL_LISTING_PASTE);
    vi.spyOn(event, 'preventDefault');
    form.dispatchEvent(event);
    TestBed.tick();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(fixture.componentInstance.model().title).toBe('Hell Difficulty Tutorial');
    expect(fixture.componentInstance.model().subtitle).toBe('A LitRPG Adventure');
    expect(fixture.componentInstance.model().authors).toEqual(['Cerim']);
    expect(fixture.componentInstance.model().pageCount).toBe(618);
    expect(fixture.componentInstance.model().seriesPosition).toBe('1');
    expect(fixture.componentInstance.model().releaseDate).toBe('2024-05-14');
    expect(fixture.componentInstance.model().releasePrecision).toBe('day');
    expect(fixture.componentInstance.model().coverUrl).toBe('https://example.com/cover.jpg');
    expect(flash.show).toHaveBeenCalledWith(expect.stringMatching(/Auto-filled \d+ field/));
  });

  it('leaves an ordinary single-field paste untouched', () => {
    const fixture = TestBed.createComponent(BookFormPage);
    fixture.detectChanges();
    TestBed.tick();

    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    const flash = TestBed.inject(Flash);
    vi.spyOn(flash, 'show');

    const event = pasteEvent('Leviathan Wakes');
    vi.spyOn(event, 'preventDefault');
    form.dispatchEvent(event);
    TestBed.tick();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(fixture.componentInstance.model().title).toBe('');
    expect(flash.show).not.toHaveBeenCalled();
  });
});
