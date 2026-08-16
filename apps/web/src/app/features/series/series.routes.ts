import type { Routes } from '@angular/router';

// `new` must precede `:id` — see the identical note in `books.routes.ts`.
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
    path: ':id',
    loadComponent: () => import('./series-detail-page').then((m) => m.SeriesDetailPage),
    title: 'Series',
  },
];
