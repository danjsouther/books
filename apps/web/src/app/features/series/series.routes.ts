import type { Routes } from '@angular/router';

// `new` must precede `:slug` — see the identical note in `books.routes.ts`.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./series-list-page').then((m) => m.SeriesListPage),
    title: 'Series',
  },
  {
    path: 'new',
    loadComponent: () => import('./series-form-page').then((m) => m.SeriesFormPage),
    title: 'New series',
  },
  {
    path: ':slug/edit',
    loadComponent: () => import('./series-form-page').then((m) => m.SeriesFormPage),
    title: 'Edit series',
  },
  {
    path: ':slug/history',
    loadComponent: () => import('./series-history-page').then((m) => m.SeriesHistoryPage),
    title: 'Series history',
  },
  {
    path: ':slug',
    loadComponent: () => import('./series-detail-page').then((m) => m.SeriesDetailPage),
    title: 'Series',
  },
];
