import { httpResource } from '@angular/common/http';
import { Component, computed, input, model, signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
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
  imports: [],
  template: `
    <div class="rounded-sm border border-border p-2">
      <ul class="flex flex-wrap gap-2">
        @for (name of value(); track name) {
          <li class="flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-1 text-sm">
            {{ name }}
            <button
              type="button"
              class="text-ink-muted"
              [attr.aria-label]="'Remove ' + name"
              (click)="remove(name)"
            >
              ✕
            </button>
          </li>
        }
      </ul>
      <input
        #authorInput
        type="text"
        [attr.aria-label]="label()"
        placeholder="Add an author"
        class="mt-2 w-full border-0 p-1 text-sm outline-none"
        [value]="query()"
        (input)="query.set(authorInput.value)"
        (keydown.enter)="onEnter($event, authorInput)"
      />
      @if (suggestions().length > 0) {
        <ul class="mt-1 divide-y divide-border border-t border-border">
          @for (suggestion of suggestions(); track suggestion.id) {
            <li>
              <button
                type="button"
                class="w-full px-1 py-1 text-left text-sm hover:bg-surface-sunken"
                (click)="add(suggestion.name, authorInput)"
              >
                {{ suggestion.name }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
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

  protected add(name: string, input: HTMLInputElement): void {
    const trimmed = name.trim();
    if (trimmed === '' || this.value().includes(trimmed)) return;
    this.value.update((names) => [...names, trimmed]);
    this.query.set('');
    input.value = '';
  }

  protected remove(name: string): void {
    this.value.update((names) => names.filter((n) => n !== name));
  }

  protected onEnter(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    this.add(input.value, input);
  }
}
