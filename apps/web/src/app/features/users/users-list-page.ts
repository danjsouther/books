import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ListResponse, UserSummary } from '@books/domain';

@Component({
  selector: 'app-users-list-page',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold">Members</h1>
    @if (users.isLoading()) {
      <p class="mt-4 text-ink-muted">Loading…</p>
    }
    @if (users.hasValue()) {
      <ul class="mt-4 space-y-1">
        @for (user of users.value().items; track user.id) {
          <li>
            <a [routerLink]="[user.id]" class="underline">{{ user.username }}</a>
          </li>
        }
      </ul>
    }
  `,
})
export class UsersListPage {
  // See `ActivityPage` for why every `value()` read is guarded by `hasValue()`.
  protected readonly users = httpResource<ListResponse<UserSummary>>(() => '/api/v1/users', {
    defaultValue: { items: [], page: 1, pageSize: 20, total: 0 },
  });
}
