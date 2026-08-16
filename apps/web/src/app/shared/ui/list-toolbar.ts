import { Component, input, model } from '@angular/core';

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

/** Search + a projected slot for resource-specific filters + sort. A `<select>`
 *  is the right tool for an enumerable sort order — the richer `@angular/aria`
 *  widgets earn their keep on the filters slot's contents, not here. */
@Component({
  selector: 'app-list-toolbar',
  imports: [],
  template: `
    <div class="flex flex-wrap items-center gap-3 border-b border-border pb-4">
      <label class="sr-only" [for]="searchId">{{ searchLabel() }}</label>
      <input
        #searchInput
        [id]="searchId"
        type="search"
        [placeholder]="searchLabel()"
        class="min-w-48 rounded-sm border border-border px-3 py-1.5 text-sm"
        [value]="query()"
        (input)="query.set(searchInput.value)"
      />

      <ng-content />

      @if (sortOptions().length > 0) {
        <label class="sr-only" [for]="sortId">Sort by</label>
        <select
          #sortSelect
          [id]="sortId"
          class="rounded-sm border border-border px-3 py-1.5 text-sm"
          [value]="sortValue()"
          (change)="sortValue.set(sortSelect.value)"
        >
          @for (option of sortOptions(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      }
    </div>
  `,
})
export class ListToolbar {
  private static nextId = 0;
  protected readonly searchId = `list-toolbar-search-${String(ListToolbar.nextId++)}`;
  protected readonly sortId = `list-toolbar-sort-${String(ListToolbar.nextId++)}`;

  readonly searchLabel = input('Search');
  readonly query = model('');
  readonly sortOptions = input<readonly SortOption[]>([]);
  readonly sortValue = model('');
}
