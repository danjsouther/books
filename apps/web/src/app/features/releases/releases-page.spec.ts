import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BookSummary, ReleasesResponse } from '@books/domain';
import { ReleasesPage } from './releases-page';

const EMPTY_SERIES = { items: [], page: 1, pageSize: 100, total: 0 };
const EMPTY_RELEASES: ReleasesResponse = {
  dated: [],
  monthly: [],
  yearly: [],
  undated: [],
  window: { from: '', to: '' },
};

function book(
  id: string,
  title: string,
  releaseDate: string | null,
  precision: BookSummary['releasePrecision'],
): BookSummary {
  return {
    id,
    title,
    subtitle: null,
    authors: [],
    seriesId: null,
    seriesPosition: null,
    releaseDate,
    releasePrecision: precision,
    asin: null,
    coverUrl: null,
    version: 1,
    deletedAt: null,
  };
}

describe('ReleasesPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match((r) => r.url === '/api/v1/series').forEach((r) => r.flush(EMPTY_SERIES));
    httpMock.verify({ ignoreCancelled: true });
  });

  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    TestBed.tick();
  }

  function flushReleases(main: ReleasesResponse, planned: ReleasesResponse = EMPTY_RELEASES): void {
    const reqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(reqs).toHaveLength(2);
    reqs.find((r) => r.request.params.get('mine') === 'false')?.flush(main);
    reqs.find((r) => r.request.params.get('mine') === 'true')?.flush(planned);
  }

  it('groups dated and monthly releases by month', async () => {
    const fixture = TestBed.createComponent(ReleasesPage);
    fixture.detectChanges();
    TestBed.tick();
    flushReleases({
      dated: [book('b1', 'Leviathan Wakes', '2027-03-05', 'day')],
      monthly: [book('b2', 'Caliban’s War', '2027-03-01', 'month')],
      yearly: [],
      undated: [],
      window: { from: '', to: '' },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('March 2027');
    expect(el.textContent).toContain('Leviathan Wakes');
    expect(el.textContent).toContain('Caliban’s War');
  });

  it('shows a TBA section grouped by year and an Undated section', async () => {
    const fixture = TestBed.createComponent(ReleasesPage);
    fixture.detectChanges();
    TestBed.tick();
    flushReleases({
      dated: [],
      monthly: [],
      yearly: [book('b3', 'Nemesis Games', '2028-01-01', 'year')],
      undated: [book('b4', 'Persepolis Rising', null, 'unknown')],
      window: { from: '', to: '' },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('TBA');
    expect(el.textContent).toContain('2028 (month TBA)');
    expect(el.textContent).toContain('Nemesis Games');
    expect(el.textContent).toContain('Undated');
    expect(el.textContent).toContain('Persepolis Rising');
  });

  it('"Show next 12 months" widens the request window', async () => {
    const fixture = TestBed.createComponent(ReleasesPage);
    fixture.detectChanges();
    TestBed.tick();
    const firstReqs = httpMock.match((r) => r.url === '/api/v1/releases');
    const firstTo = firstReqs[0]?.request.params.get('to');
    firstReqs.forEach((r) => r.flush(EMPTY_RELEASES));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Show next 12 months',
    )!;
    button.click();
    fixture.detectChanges();
    TestBed.tick();

    const secondReqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(secondReqs).toHaveLength(2);
    const secondTo = secondReqs[0]?.request.params.get('to');
    expect(secondTo).not.toBe(firstTo);
    secondReqs.forEach((r) => r.flush(EMPTY_RELEASES));
  });

  it('"Only my planned releases" round-trips through the release store', async () => {
    const fixture = TestBed.createComponent(ReleasesPage);
    fixture.detectChanges();
    TestBed.tick();
    flushReleases(EMPTY_RELEASES);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    fixture.detectChanges();

    const reqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.request.params.get('mine')).toBe('true');
    reqs.forEach((r) => r.flush(EMPTY_RELEASES));
  });
});
