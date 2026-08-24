import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { BookSummary, ReleasesResponse } from '@books/domain';
import { createReleaseStore } from './release-store';

const WINDOW = { from: '2027-03-01', to: '2027-03-31' };

function book(id: string, title = 'A Book'): BookSummary {
  return {
    id,
    slug: id,
    title,
    subtitle: null,
    authors: [],
    seriesId: null,
    seriesName: null,
    seriesSlug: null,
    seriesPosition: null,
    releaseDate: '2027-03-05',
    releasePrecision: 'day',
    asin: null,
    coverUrl: null,
    version: 1,
    deletedAt: null,
  };
}

function releases(dated: BookSummary[]): ReleasesResponse {
  return { dated, monthly: [], yearly: [], undated: [], window: WINDOW };
}

const EMPTY: ReleasesResponse = releases([]);

describe('createReleaseStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  function build() {
    const windowSignal = signal(WINDOW);
    return TestBed.runInInjectionContext(() => createReleaseStore(windowSignal));
  }

  function flushBoth(main: ReleasesResponse, planned: ReleasesResponse): void {
    const reqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(reqs).toHaveLength(2);
    const mainReq = reqs.find((r) => r.request.params.get('mine') === 'false');
    const plannedReq = reqs.find((r) => r.request.params.get('mine') === 'true');
    mainReq?.flush(main);
    plannedReq?.flush(planned);
  }

  it('always requests the planned-ids resource with mine=true, regardless of mineOnly', () => {
    const store = build();
    TestBed.tick();
    expect(store.mineOnly()).toBe(false);
    flushBoth(EMPTY, EMPTY);
  });

  it('reflects the planned-ids response in plannedIds', async () => {
    const store = build();
    TestBed.tick();
    flushBoth(releases([book('b1'), book('b2')]), releases([book('b1')]));
    await Promise.resolve();
    TestBed.tick();

    expect(store.plannedIds().has('b1')).toBe(true);
    expect(store.plannedIds().has('b2')).toBe(false);
  });

  it('togglePlan optimistically flips plannedIds before the request resolves', async () => {
    const store = build();
    TestBed.tick();
    flushBoth(releases([book('b1')]), EMPTY);
    await Promise.resolve();
    TestBed.tick();

    expect(store.plannedIds().has('b1')).toBe(false);
    store.togglePlan(book('b1'));
    expect(store.plannedIds().has('b1')).toBe(true);

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books/b1/me');
    expect(req.request.body).toEqual({ status: 'plan' });
    req.flush({});
  });

  it('togglePlan reverts the optimistic flip on error', async () => {
    const store = build();
    TestBed.tick();
    flushBoth(releases([book('b1')]), EMPTY);
    await Promise.resolve();
    TestBed.tick();

    store.togglePlan(book('b1'));
    expect(store.plannedIds().has('b1')).toBe(true);

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books/b1/me');
    req.flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });

    expect(store.plannedIds().has('b1')).toBe(false);
  });

  it('re-requests both resources when seriesId changes', () => {
    const store = build();
    TestBed.tick();
    flushBoth(EMPTY, EMPTY);

    store.seriesId.set('series-1');
    TestBed.tick();

    const reqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(reqs).toHaveLength(2);
    for (const r of reqs) expect(r.request.params.get('seriesId')).toBe('series-1');
    reqs.forEach((r) => r.flush(EMPTY));
  });
});
