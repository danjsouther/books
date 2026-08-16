import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import type { ActivityFeed } from '@books/domain';

@Component({
  selector: 'app-activity-page',
  imports: [],
  template: `
    <h1 class="text-2xl font-semibold">Activity</h1>
    @if (feed.isLoading()) {
      <p class="mt-4 text-ink-muted">Loading…</p>
    }
    @if (feed.hasValue()) {
      <ul class="mt-4 space-y-1">
        @for (item of feed.value().items; track item.id) {
          <li>{{ item.kind }} — {{ item.book?.title ?? item.actor?.username ?? 'system' }}</li>
        }
      </ul>
    }
  `,
})
export class ActivityPage {
  // `value()` throws in the resource's error state — the template guards every
  // read behind `hasValue()` rather than relying on `defaultValue`, which only
  // covers the idle/loading states.
  protected readonly feed = httpResource<ActivityFeed>(() => '/api/v1/activity', {
    defaultValue: { items: [], nextCursor: null },
  });
}
