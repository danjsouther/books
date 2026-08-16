import type { Routes } from '@angular/router';

// `new` must precede `:id` — the router matches routes in order, and `:id` would
// otherwise swallow a literal `/books/new` as if `new` were a book id. `:id/edit`
// and `:id/history` are unaffected by that ordering — `:id` alone is a single
// path segment and never matches a two-segment URL.
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
    path: ':id/edit',
    loadComponent: () => import('./book-form-page').then((m) => m.BookFormPage),
    title: 'Edit book',
  },
  {
    path: ':id/history',
    loadComponent: () => import('./book-history-page').then((m) => m.BookHistoryPage),
    title: 'Book history',
  },
  {
    path: ':id',
    loadComponent: () => import('./book-detail-page').then((m) => m.BookDetailPage),
    title: 'Book',
  },
];
