import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ActivityFeed, ActivityItem } from '@books/domain';
import { ActivityPage } from './activity-page';

const EMPTY_USERS = { items: [], page: 1, pageSize: 10, total: 0 };

function item(id: number, kind: ActivityItem['kind'] = 'book.added'): ActivityItem {
  return {
    id,
    kind,
    actor: { id: 'u1', username: 'alice' },
    book: { id: 'b1', title: 'A Book' },
    payload: {},
    createdAt: new Date().toISOString(),
  };
}

describe('ActivityPage', () => {
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

  function create() {
    const fixture = TestBed.createComponent(ActivityPage);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  it('requests the first page with no cursor on initial render', () => {
    const fixture = create();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/activity');
    expect(req.request.params.has('before')).toBe(false);
    expect(req.request.params.has('kind')).toBe(false);
    req.flush({ items: [item(3), item(2)], nextCursor: 2 } satisfies ActivityFeed);
    fixture.detectChanges();
  });

  it('"Load more" appends the next page and sends the right cursor', () => {
    const fixture = create();
    httpMock
      .expectOne((r) => r.url === '/api/v1/activity')
      .flush({ items: [item(3), item(2)], nextCursor: 2 } satisfies ActivityFeed);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Load more',
    )!;
    expect(button).toBeTruthy();
    button.click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/activity');
    expect(req.request.params.get('before')).toBe('2');
    req.flush({ items: [item(1)], nextCursor: null } satisfies ActivityFeed);
    fixture.detectChanges();

    expect(el.querySelectorAll('li')).toHaveLength(3);
  });

  it('hides "Load more" once nextCursor is null', () => {
    const fixture = create();
    httpMock
      .expectOne((r) => r.url === '/api/v1/activity')
      .flush({ items: [item(1)], nextCursor: null } satisfies ActivityFeed);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Load more',
    );
    expect(button).toBeUndefined();
  });

  it('changing the kind filter resets items and re-requests from scratch', () => {
    const fixture = create();
    httpMock
      .expectOne((r) => r.url === '/api/v1/activity')
      .flush({ items: [item(1)], nextCursor: 3 } satisfies ActivityFeed);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('li')).toHaveLength(1);

    const statusOption = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent?.trim() === 'Status changed',
    );
    expect(statusOption).toBeTruthy();
    statusOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/activity');
    expect(req.request.params.get('kind')).toBe('status.changed');
    expect(req.request.params.has('before')).toBe(false);
    req.flush({ items: [item(9, 'status.changed')], nextCursor: null } satisfies ActivityFeed);
    fixture.detectChanges();

    expect(el.querySelectorAll('li')).toHaveLength(1);
  });

  it('renders a book.released row with no actor', () => {
    const fixture = create();
    httpMock
      .expectOne((r) => r.url === '/api/v1/activity')
      .flush({
        items: [{ ...item(1, 'book.released'), actor: null }],
        nextCursor: null,
      } satisfies ActivityFeed);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('is out today');
    expect(el.textContent).toContain('A Book');
  });
});
