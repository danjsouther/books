import type { Routes } from '@angular/router';

// `new` must precede `:id` — the router matches routes in order, and `:id` would
// otherwise swallow a literal `/books/new` as if `new` were a book id.
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
    path: ':id',
    loadComponent: () => import('./book-detail-page').then((m) => m.BookDetailPage),
    title: 'Book',
  },
];
