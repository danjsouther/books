import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ReleasesResponse } from '@books/domain';
import { CalendarPage } from './calendar-page';

const EMPTY_SERIES = { items: [], page: 1, pageSize: 10, total: 0 };
const EMPTY_RELEASES: ReleasesResponse = {
  dated: [],
  monthly: [],
  yearly: [],
  undated: [],
  window: { from: '', to: '' },
};

describe('CalendarPage', () => {
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

  function create(year: string, month: string) {
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.componentRef.setInput('year', year);
    fixture.componentRef.setInput('month', month);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  function flushReleases(main: ReleasesResponse, planned: ReleasesResponse = EMPTY_RELEASES): void {
    const reqs = httpMock.match((r) => r.url === '/api/v1/releases');
    expect(reqs).toHaveLength(2);
    reqs.find((r) => r.request.params.get('mine') === 'false')?.flush(main);
    reqs.find((r) => r.request.params.get('mine') === 'true')?.flush(planned);
  }

  it('renders a 6x7 grid of day cells', async () => {
    const fixture = create('2027', '3');
    flushReleases(EMPTY_RELEASES);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const cells = el.querySelectorAll('.day-cell');
    expect(cells.length).toBe(42);
  });

  it('renders a release inside a single day cell', async () => {
    const fixture = create('2027', '3');
    flushReleases({
      dated: [
        {
          id: 'b1',
          slug: 'leviathan-wakes',
          title: 'Leviathan Wakes',
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
        },
      ],
      monthly: [],
      yearly: [],
      undated: [],
      window: { from: '2027-02-22', to: '2027-04-11' },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const cell = el.querySelector('#cell-2027-03-05')!;
    expect(cell).toBeTruthy();
    const widgets = cell.querySelectorAll('.releases');
    expect(widgets.length).toBe(1);
    expect(cell.textContent).toContain('Leviathan Wakes');
  });

  it('clicking the plan toggle calls ShelfApi with status "plan"', async () => {
    const fixture = create('2027', '3');
    flushReleases({
      dated: [
        {
          id: 'b1',
          slug: 'leviathan-wakes',
          title: 'Leviathan Wakes',
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
        },
      ],
      monthly: [],
      yearly: [],
      undated: [],
      window: { from: '2027-02-22', to: '2027-04-11' },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Plan Leviathan Wakes"]',
    )!;
    expect(button).toBeTruthy();
    button.click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books/b1/me');
    expect(req.request.body).toEqual({ status: 'plan' });
    req.flush({});
  });

  it('renders the plan toggle as an icon that still names itself and reports state', async () => {
    const fixture = create('2027', '3');
    flushReleases({
      dated: [
        {
          id: 'b1',
          slug: 'leviathan-wakes',
          title: 'Leviathan Wakes',
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
        },
      ],
      monthly: [],
      yearly: [],
      undated: [],
      window: { from: '2027-02-22', to: '2027-04-11' },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Plan Leviathan Wakes"]',
    )!;
    // The glyph replaces the text label, so the name and the pressed state must
    // both still come from ARIA rather than from what is drawn.
    expect(button.classList).toContain('compact');
    expect(button.textContent?.trim()).toBe('add');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('PageDown navigates to the next month', async () => {
    const fixture = create('2027', '3');
    flushReleases(EMPTY_RELEASES);
    await settle(fixture);

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const el = fixture.nativeElement as HTMLElement;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));

    expect(navigateSpy).toHaveBeenCalledWith(['/calendar', '2027', '4']);
  });

  it('rolls over into the next year when navigating past December', async () => {
    const fixture = create('2027', '12');
    flushReleases(EMPTY_RELEASES);
    await settle(fixture);

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const el = fixture.nativeElement as HTMLElement;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));

    expect(navigateSpy).toHaveBeenCalledWith(['/calendar', '2028', '1']);
  });

  it('does not steal focus on the initial render', async () => {
    const fixture = create('2027', '3');
    flushReleases(EMPTY_RELEASES);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.contains(document.activeElement)).toBe(false);
  });
});
