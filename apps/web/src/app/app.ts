import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

interface NavItem {
  readonly path: string;
  readonly label: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  protected readonly title = signal('Books');

  protected readonly navItems: readonly NavItem[] = [
    { path: '/activity', label: 'Activity' },
    { path: '/changes', label: 'Changes' },
    { path: '/books', label: 'Books' },
    { path: '/series', label: 'Series' },
    { path: '/calendar', label: 'Calendar' },
    { path: '/releases', label: 'Releases' },
  ];

  /**
   * Announced in a polite live region after each navigation. Reads the resolved
   * route title so it stays correct as routes are added, and falls back to the
   * URL so a route that forgets a title still announces something.
   */
  protected readonly routeAnnouncement = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => `Navigated to ${document.title || this.router.url}`),
    ),
    { initialValue: '' },
  );
}
