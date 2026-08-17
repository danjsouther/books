import { httpResource } from '@angular/common/http';
import { Component, computed, input, model, signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatChipsModule, type MatChipInputEvent } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { Author } from '@books/domain';

/**
 * A creatable multi-select: type a name, pick a suggestion from `GET /authors?q=`,
 * or press Enter to add whatever was typed even if it matches nothing — authors
 * are resolved/created server-side on save (`resolveAuthors` in
 * `packages/db/src/mutations/authors.ts`), so the client never needs to know
 * whether a name is new. A `FormValueControl<string[]>` so it binds via
 * `[formField]` like any other field.
 */
@Component({
  selector: 'app-authors-input',
  imports: [MatChipsModule, MatFormFieldModule, MatAutocompleteModule],
  template: `
    <mat-form-field subscriptSizing="dynamic" class="field">
      <mat-label>{{ label() }}</mat-label>
      <mat-chip-grid #grid [attr.aria-label]="label()">
        @for (name of value(); track name) {
          <mat-chip-row (removed)="remove(name)">
            {{ name }}
            <button type="button" matChipRemove [attr.aria-label]="'Remove ' + name">✕</button>
          </mat-chip-row>
        }
      </mat-chip-grid>
      <input
        placeholder="Add an author"
        [matChipInputFor]="grid"
        [matAutocomplete]="auto"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (matChipInputTokenEnd)="onTokenEnd($event)"
      />
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelected($event)">
        @for (suggestion of suggestions(); track suggestion.id) {
          <mat-option [value]="suggestion.name">{{ suggestion.name }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
})
export class AuthorsInput implements FormValueControl<string[]> {
  readonly value = model<string[]>([]);
  readonly label = input('Authors');

  protected readonly query = signal('');

  private readonly suggestionsResource = httpResource<Author[]>(
    () =>
      this.query().trim() === ''
        ? undefined
        : `/api/v1/authors?q=${encodeURIComponent(this.query())}`,
    { defaultValue: [] },
  );
  protected readonly suggestions = computed<Author[]>(() => {
    if (!this.suggestionsResource.hasValue()) return [];
    return this.suggestionsResource.value().filter((a) => !this.value().includes(a.name));
  });

  protected add(name: string): void {
    const trimmed = name.trim();
    if (trimmed === '' || this.value().includes(trimmed)) return;
    this.value.update((names) => [...names, trimmed]);
    this.query.set('');
  }

  protected remove(name: string): void {
    this.value.update((names) => names.filter((n) => n !== name));
  }

  protected onTokenEnd(event: MatChipInputEvent): void {
    this.add(event.value);
    event.chipInput.clear();
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    this.add(event.option.viewValue);
    event.option.deselect();
  }
}
