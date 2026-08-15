import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the app shell landmarks', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('header')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Main"]')).toBeTruthy();
    expect(el.querySelector('footer')).toBeTruthy();
  });

  it('exposes a focusable main region for the skip link to target', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const skipLink = el.querySelector<HTMLAnchorElement>('a.skip-link');
    const main = el.querySelector<HTMLElement>('main#main-content');

    expect(skipLink?.getAttribute('href')).toBe('#main-content');
    expect(main).toBeTruthy();
    // Without tabindex="-1" the skip link moves the viewport but not focus.
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('provides a polite live region for route announcements', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
