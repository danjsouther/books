import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import type { ChangeItem, ListResponse } from '@books/domain';

@Component({
  selector: 'app-changes-page',
  imports: [],
  template: `
    <h1 class="text-2xl font-semibold">Changes</h1>
    @if (changes.isLoading()) {
      <p class="mt-4 text-ink-muted">Loading…</p>
    }
    @if (changes.hasValue()) {
      <ul class="mt-4 space-y-1">
        @for (item of changes.value().items; track item.entityId + item.version) {
          <li>
            {{ item.entityType }} · {{ item.title }} · {{ item.changeKind }} (v{{ item.version }})
          </li>
        }
      </ul>
    }
  `,
})
export class ChangesPage {
  // See `ActivityPage` for why every `value()` read is guarded by `hasValue()`.
  protected readonly changes = httpResource<ListResponse<ChangeItem>>(() => '/api/v1/changes', {
    defaultValue: { items: [], page: 1, pageSize: 20, total: 0 },
  });
}
