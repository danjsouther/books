import { Component, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule, type MatSelectChange } from '@angular/material/select';

export interface SortOption {
  readonly value: string;
  readonly label: string;
  /** The direction this option makes sense in by default — e.g. a name sorts
   *  ascending (A-Z), a "recently updated" sorts descending (newest first).
   *  Picking a new sort field resets to this rather than carrying over
   *  whatever direction the previous field was left on. */
  readonly defaultDir: 'asc' | 'desc';
}

/** Search + a projected slot for resource-specific filters + sort. */
@Component({
  selector: 'app-list-toolbar',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
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
        @if (query()) {
          <button
            matSuffix
            mat-icon-button
            type="button"
            [attr.aria-label]="'Clear ' + searchLabel()"
            (click)="query.set('')"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      <ng-content />

      @if (sortOptions().length > 0) {
        <mat-form-field subscriptSizing="dynamic" class="sort-field">
          <mat-label>Sort by</mat-label>
          <mat-select [value]="sortValue()" (selectionChange)="onSortValueChange($event)">
            @for (option of sortOptions(); track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button
          mat-icon-button
          type="button"
          [attr.aria-label]="sortDir() === 'asc' ? 'Sort descending' : 'Sort ascending'"
          (click)="toggleSortDir()"
        >
          <mat-icon>{{ sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
        </button>
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
  readonly sortDir = model<'asc' | 'desc'>('asc');

  protected onSortValueChange(event: MatSelectChange): void {
    const value = event.value as string;
    this.sortValue.set(value);
    const defaultDir = this.sortOptions().find((o) => o.value === value)?.defaultDir ?? 'asc';
    this.sortDir.set(defaultDir);
  }

  protected toggleSortDir(): void {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
  }
}
