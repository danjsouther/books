import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createListStore } from './list-store';

interface Item {
  readonly id: string;
  readonly title: string;
}
interface Filters extends Record<string, unknown> {
  readonly q: string;
}

const EMPTY_PAGE = { items: [], page: 1, pageSize: 20, total: 0 };

describe('createListStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // A filter or page change cancels whatever request was already in flight for
    // the old params — those cancellations are expected, not something each test
    // needs to account for one by one.
    httpMock.verify({ ignoreCancelled: true });
    vi.useRealTimers();
  });

  /** Flushes every currently-open, non-cancelled request to `/api/v1/things` —
   *  the point is to unstick the resource, not to assert on exactly which
   *  request survived a debounce/param change. */
  function drain(): void {
    httpMock
      .match((r) => r.url === '/api/v1/things')
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(EMPTY_PAGE));
  }

  function build() {
    return TestBed.runInInjectionContext(() =>
      createListStore<Item, Filters>('/api/v1/things', { q: '' }),
    );
  }

  it('starts on page 1 with the default filters', () => {
    const store = build();
    TestBed.tick();
    expect(store.page()).toBe(1);
    expect(store.filters()).toEqual({ q: '' });
    drain();
  });

  it('resets to page 1 when a filter changes', () => {
    const store = build();
    TestBed.tick();
    drain();

    store.goToPage(3);
    expect(store.page()).toBe(3);
    TestBed.tick();
    drain();

    store.setFilter('q', 'dune');
    expect(store.page()).toBe(1);

    vi.advanceTimersByTime(250);
    TestBed.tick();
    drain();
  });

  it('debounces filter changes rather than firing a request per keystroke', () => {
    const store = build();
    TestBed.tick();
    drain();

    store.setFilter('q', 'd');
    store.setFilter('q', 'du');
    store.setFilter('q', 'dun');
    vi.advanceTimersByTime(100);
    TestBed.tick();
    // Nothing new should have gone out yet — the debounce window hasn't elapsed.
    const inFlight = httpMock.match((r) => r.url === '/api/v1/things');
    expect(inFlight.filter((r) => !r.cancelled)).toHaveLength(0);

    vi.advanceTimersByTime(200);
    TestBed.tick();
    const settled = httpMock.match(
      (r) => r.url === '/api/v1/things' && r.params.get('q') === 'dun',
    );
    expect(settled.filter((r) => !r.cancelled)).toHaveLength(1);
    settled.filter((r) => !r.cancelled).forEach((r) => r.flush(EMPTY_PAGE));
  });

  it('clearFilters restores defaults and resets the page', () => {
    const store = build();
    TestBed.tick();
    drain();

    store.setFilter('q', 'dune');
    store.goToPage(2);
    vi.advanceTimersByTime(250);
    TestBed.tick();
    drain();

    store.clearFilters();
    expect(store.filters()).toEqual({ q: '' });
    expect(store.page()).toBe(1);
    vi.advanceTimersByTime(250);
    TestBed.tick();
    drain();
  });
});
