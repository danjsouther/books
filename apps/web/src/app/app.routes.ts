import type { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
    title: 'Sign in',
  },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'activity' },
      {
        path: 'activity',
        loadComponent: () =>
          import('./features/activity/activity-page').then((m) => m.ActivityPage),
        title: 'Activity',
      },
      {
        path: 'changes',
        loadComponent: () => import('./features/changes/changes-page').then((m) => m.ChangesPage),
        title: 'Changes',
      },
      {
        path: 'books',
        loadChildren: () => import('./features/books/books.routes').then((m) => m.routes),
      },
      {
        path: 'series',
        loadChildren: () => import('./features/series/series.routes').then((m) => m.routes),
      },
      // The calendar and the release list share one `ReleaseStore` once Phase 7
      // gives them real content — see the plan note on why that wrapper route
      // isn't added yet.
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
        title: 'Calendar',
      },
      {
        path: 'releases',
        loadComponent: () =>
          import('./features/releases/releases-page').then((m) => m.ReleasesPage),
        title: 'Releases',
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then((m) => m.routes),
      },
      {
        path: 'me',
        loadComponent: () => import('./features/me/me-page').then((m) => m.MePage),
        title: 'My shelf',
      },
      {
        path: 'trash',
        loadComponent: () => import('./features/trash/trash-page').then((m) => m.TrashPage),
        title: 'Trash',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
    title: 'Not found',
  },
];
