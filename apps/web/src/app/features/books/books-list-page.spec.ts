import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BookListItem } from '@books/domain';
import { BooksListPage } from './books-list-page';

const EMPTY_BOOKS = { items: [], page: 1, pageSize: 20, total: 0 };
const EMPTY_SERIES = { items: [], page: 1, pageSize: 10, total: 0 };

function book(overrides: Partial<BookListItem> = {}): BookListItem {
  return {
    id: 'b1',
    slug: 'leviathan-wakes',
    title: 'Leviathan Wakes',
    subtitle: null,
    authors: [{ id: 'a1', name: 'James S. A. Corey' }],
    seriesId: 's1',
    seriesName: 'The Expanse',
    seriesSlug: 'the-expanse',
    seriesPosition: '1',
    releaseDate: '2011-06-15',
    releasePrecision: 'day',
    asin: null,
    coverUrl: 'https://example.test/cover.jpg',
    version: 1,
    deletedAt: null,
    myStatus: null,
    ...overrides,
  };
}

function booksPage(items: BookListItem[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}

describe('BooksListPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    // The view preference persists across page loads by design, so it must not
    // persist across tests.
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
    vi.useRealTimers();
  });

  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    // `httpResource` settles on a microtask after `flush()`, not synchronously —
    // a bare `detectChanges()` right after `flush()` reads stale loading state.
    await Promise.resolve();
    fixture.detectChanges();
    TestBed.tick();
  }

  it('requests books with an empty filter set on first render', async () => {
    const fixture = TestBed.createComponent(BooksListPage);
    fixture.detectChanges();
    TestBed.tick();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books');
    expect(req.request.params.has('seriesId')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush(EMPTY_BOOKS);
    await settle(fixture);

    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
  });

  it('picking a status filter re-requests books with that status in the query', async () => {
    const fixture = TestBed.createComponent(BooksListPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books').flush(EMPTY_BOOKS);
    await settle(fixture);
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const readingOption = Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (o) => o.textContent?.trim() === 'Reading',
    );
    expect(readingOption).toBeTruthy();
    readingOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    // The whole filters object is debounced (250ms) before it drives a request.
    vi.advanceTimersByTime(250);
    TestBed.tick();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books');
    expect(req.request.params.get('status')).toBe('reading');
    req.flush(EMPTY_BOOKS);
  });

  /** Renders the page with `items` already loaded and both resources settled. */
  async function renderWith(items: BookListItem[]) {
    const fixture = TestBed.createComponent(BooksListPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books').flush(booksPage(items));
    await settle(fixture);
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    await settle(fixture);
    return fixture;
  }

  it('defaults to the list view, with a cover thumbnail per row', async () => {
    const fixture = await renderWith([book()]);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.rows')).toBeTruthy();
    expect(el.querySelector('.tiles')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('width')).toBe('32');
  });

  it('lays a list row out in columns rather than one stacked block', async () => {
    const fixture = await renderWith([book()]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('.row-link');

    // Each field is its own pinned cell, so a book missing one does not shift
    // the rest out of column.
    expect(row?.querySelector('.title-cell')?.textContent?.trim()).toBe('Leviathan Wakes');
    expect(row?.querySelector('.series-cell')?.textContent?.trim()).toBe('The Expanse');
    expect(row?.querySelector('.authors-cell')?.textContent?.trim()).toBe('James S. A. Corey');
    expect(row?.querySelector('.date-cell')?.textContent?.trim()).toContain('2011');
  });

  it('omits the series and author cells for a book that has neither', async () => {
    const fixture = await renderWith([
      book({ seriesId: null, seriesName: null, seriesPosition: null, authors: [] }),
    ]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('.row-link');

    expect(row?.querySelector('.series-cell')).toBeNull();
    expect(row?.querySelector('.authors-cell')).toBeNull();
    expect(row?.querySelector('.title-cell')).toBeTruthy();
  });

  it('badges a row with the viewer’s own status, omitting the badge when unset', async () => {
    const fixture = await renderWith([
      book({ id: 'b1', title: 'Reading', myStatus: 'reading' }),
      book({ id: 'b2', title: 'Untouched', myStatus: null }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('.row-link');

    expect(rows[0]?.querySelector('.status-cell')?.textContent).toContain('Reading');
    expect(rows[1]?.querySelector('.status-cell')).toBeNull();
  });

  it('badges a grid tile with the viewer’s own status too', async () => {
    const fixture = await renderWith([book({ myStatus: 'completed' })]);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLElement>('[aria-label="Grid view"]')?.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(el.querySelector('.tile .my-status')?.textContent).toContain('Completed');
  });

  it('omits the grid tile badge for a book with no shelf entry', async () => {
    const fixture = await renderWith([book({ myStatus: null })]);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLElement>('[aria-label="Grid view"]')?.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(el.querySelector('.tile .my-status')).toBeNull();
  });

  it('switching to the grid view renders full-size covers with the series name', async () => {
    const fixture = await renderWith([book()]);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLElement>('[aria-label="Grid view"]')?.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(el.querySelector('.tiles')).toBeTruthy();
    expect(el.querySelector('.rows')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('width')).toBe('180');
    expect(el.textContent).toContain('The Expanse');
  });

  it('remembers the chosen view for the next visit', async () => {
    const first = await renderWith([book()]);
    (first.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[aria-label="Grid view"]')
      ?.click();
    first.detectChanges();
    TestBed.tick();
    first.destroy();

    const second = await renderWith([book()]);
    expect((second.nativeElement as HTMLElement).querySelector('.tiles')).toBeTruthy();
  });

  it('renders a placeholder, not a broken image, for a book with no cover', async () => {
    const fixture = await renderWith([book({ coverUrl: null })]);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.no-cover')).toBeTruthy();
  });

  it('shows an empty state when there are no results', async () => {
    const fixture = TestBed.createComponent(BooksListPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books').flush(EMPTY_BOOKS);
    await settle(fixture);
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No books match your filters');
  });
});
