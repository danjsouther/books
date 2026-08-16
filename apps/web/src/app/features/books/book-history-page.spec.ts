import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookHistoryPage } from './book-history-page';

const REVISIONS = {
  items: [
    { version: 2, changeKind: 'edited', changedBy: 'user-1', changedAt: '2026-01-02', note: null },
    { version: 1, changeKind: 'created', changedBy: 'user-1', changedAt: '2026-01-01', note: null },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};

describe('BookHistoryPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    TestBed.tick();
  }

  it('expanding a row fetches and renders its diff against the previous version', async () => {
    const fixture = TestBed.createComponent(BookHistoryPage);
    fixture.componentRef.setInput('id', 'book-1');
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books/book-1/revisions').flush(REVISIONS);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const showDiffButtons = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.textContent?.trim() === 'Show diff',
    );
    expect(showDiffButtons).toHaveLength(2);
    showDiffButtons[0]?.click(); // version 2's row
    fixture.detectChanges();
    TestBed.tick();

    const diffReq = httpMock.expectOne(
      (r) => r.url === '/api/v1/books/book-1/revisions/2/diff?against=1',
    );
    diffReq.flush([{ field: 'title', before: 'Old Title', after: 'New Title' }]);
    await settle(fixture);

    expect(el.textContent).toContain('title');
    expect(el.textContent).toContain('New Title');
  });

  it('does not fetch a diff for version 1 — there is no predecessor', async () => {
    const fixture = TestBed.createComponent(BookHistoryPage);
    fixture.componentRef.setInput('id', 'book-1');
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne((r) => r.url === '/api/v1/books/book-1/revisions').flush(REVISIONS);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const showDiffButtons = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.textContent?.trim() === 'Show diff',
    );
    showDiffButtons[1]?.click(); // version 1's row
    fixture.detectChanges();
    TestBed.tick();

    httpMock.expectNone((r) => r.url.includes('/diff'));
  });
});
