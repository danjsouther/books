import type { Routes } from '@angular/router';

// No `new` — members are created by signing in with Discord, never through the UI.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./users-list-page').then((m) => m.UsersListPage),
    title: 'Members',
  },
  {
    path: ':id',
    loadComponent: () => import('./user-profile-page').then((m) => m.UserProfilePage),
    title: 'Member',
  },
];
