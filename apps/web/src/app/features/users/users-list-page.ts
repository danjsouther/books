import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ListResponse, UserSummary } from '@books/domain';

@Component({
  selector: 'app-users-list-page',
  imports: [RouterLink],
  template: `
    <h1>Members</h1>
    @if (users.isLoading()) {
      <p class="muted">Loading…</p>
    }
    @if (users.hasValue()) {
      <ul class="list">
        @for (user of users.value().items; track user.id) {
          <li>
            <a [routerLink]="[user.id]">{{ user.username }}</a>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .muted {
      margin-top: 1rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
    }

    a {
      color: var(--mat-sys-primary);
      text-decoration: underline;
    }
  `,
})
export class UsersListPage {
  // See `ActivityPage` for why every `value()` read is guarded by `hasValue()`.
  protected readonly users = httpResource<ListResponse<UserSummary>>(() => '/api/v1/users', {
    defaultValue: { items: [], page: 1, pageSize: 20, total: 0 },
  });
}
