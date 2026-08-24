import type { Routes } from '@angular/router';

// `new` must precede `:slug` — the router matches routes in order, and `:slug`
// would otherwise swallow a literal `/books/new` as if `new` were a book slug.
// `:slug/edit` and `:slug/history` are unaffected by that ordering — `:slug`
// alone is a single path segment and never matches a two-segment URL.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./books-list-page').then((m) => m.BooksListPage),
    title: 'Books',
  },
  {
    path: 'new',
    loadComponent: () => import('./book-form-page').then((m) => m.BookFormPage),
    title: 'New book',
  },
  {
    path: ':slug/edit',
    loadComponent: () => import('./book-form-page').then((m) => m.BookFormPage),
    title: 'Edit book',
  },
  {
    path: ':slug/history',
    loadComponent: () => import('./book-history-page').then((m) => m.BookHistoryPage),
    title: 'Book history',
  },
  {
    path: ':slug',
    loadComponent: () => import('./book-detail-page').then((m) => m.BookDetailPage),
    title: 'Book',
  },
];
