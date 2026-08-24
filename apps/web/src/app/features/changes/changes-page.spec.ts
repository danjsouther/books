import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ChangeItem, ListResponse } from '@books/domain';
import { ChangesPage } from './changes-page';

const EMPTY_USERS = { items: [], page: 1, pageSize: 10, total: 0 };

function change(overrides: Partial<ChangeItem> = {}): ChangeItem {
  return {
    entityType: 'book',
    entityId: 'b1',
    entitySlug: 'a-book',
    version: 1,
    changeKind: 'edited',
    actorId: 'u1',
    changedAt: '2027-03-05T12:00:00Z',
    title: 'A Book',
    changedFields: ['title'],
    ...overrides,
  };
}

describe('ChangesPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match((r) => r.url === '/api/v1/users').forEach((r) => r.flush(EMPTY_USERS));
    httpMock.verify({ ignoreCancelled: true });
  });

  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    TestBed.tick();
  }

  function create() {
    const fixture = TestBed.createComponent(ChangesPage);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  async function createWithChanges(items: ChangeItem[]) {
    const fixture = create();
    httpMock
      .expectOne((r) => r.url === '/api/v1/changes')
      .flush({
        items,
        page: 1,
        pageSize: 20,
        total: items.length,
      } satisfies ListResponse<ChangeItem>);
    await settle(fixture);
    return fixture;
  }

  it('collapses a burst of edits into one "N times" row', async () => {
    const fixture = await createWithChanges([
      change({ version: 3, changedAt: '2027-03-05T12:20:00Z' }),
      change({ version: 2, changedAt: '2027-03-05T12:10:00Z' }),
      change({ version: 1, changedAt: '2027-03-05T12:00:00Z' }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('edited');
    expect(el.textContent).toContain('3 times');
    expect(el.textContent).toContain('v3');
  });

  it('clicking Revert on a book row calls BooksApi.revert with the oldest version in the group', async () => {
    const fixture = await createWithChanges([change({ version: 1, entityId: 'b1' })]);

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revert',
    )!;
    button.click();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/books/b1/revert');
    expect(req.request.body).toEqual({ toVersion: 0, note: null });
    req.flush({});
  });

  it('clicking Revert on a series row calls SeriesApi.revert instead', async () => {
    const fixture = await createWithChanges([
      change({ version: 1, entityType: 'series', entityId: 's1' }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revert',
    )!;
    button.click();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/series/s1/revert');
    expect(req.request.body).toEqual({ toVersion: 0, note: null });
    req.flush({});
  });

  it('does not show a Revert control on a "created" row', async () => {
    const fixture = await createWithChanges([change({ changeKind: 'created', version: 1 })]);

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revert',
    );
    expect(button).toBeUndefined();
  });
});
