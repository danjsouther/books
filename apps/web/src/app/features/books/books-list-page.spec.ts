import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BooksListPage } from './books-list-page';

const EMPTY_BOOKS = { items: [], page: 1, pageSize: 20, total: 0 };
const EMPTY_SERIES = { items: [], page: 1, pageSize: 10, total: 0 };

describe('BooksListPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
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
    const readingOption = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent?.trim() === 'reading',
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
