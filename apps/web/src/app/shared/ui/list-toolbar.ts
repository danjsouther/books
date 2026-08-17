import { Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

/** Search + a projected slot for resource-specific filters + sort. */
@Component({
  selector: 'app-list-toolbar',
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <div class="toolbar">
      <mat-form-field subscriptSizing="dynamic" class="search-field">
        <mat-label>{{ searchLabel() }}</mat-label>
        <input
          #searchInput
          matInput
          type="search"
          [value]="query()"
          (input)="query.set(searchInput.value)"
        />
      </mat-form-field>

      <ng-content />

      @if (sortOptions().length > 0) {
        <mat-form-field subscriptSizing="dynamic" class="sort-field">
          <mat-label>Sort by</mat-label>
          <mat-select [value]="sortValue()" (selectionChange)="sortValue.set($event.value)">
            @for (option of sortOptions(); track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>
  `,
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .search-field {
      min-width: 12rem;
    }

    .sort-field {
      min-width: 10rem;
    }
  `,
})
export class ListToolbar {
  readonly searchLabel = input('Search');
  readonly query = model('');
  readonly sortOptions = input<readonly SortOption[]>([]);
  readonly sortValue = model('');
}
