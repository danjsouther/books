import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import type { SeriesDetail } from '@books/domain';
import { readSaveConflict } from '../../core/save-conflict';
import { SeriesApi } from './series-api';

interface SeriesFormModel {
  name: string;
  sortName: string;
  description: string;
}

const BLANK_MODEL: SeriesFormModel = { name: '', sortName: '', description: '' };

@Component({
  selector: 'app-series-form-page',
  imports: [RouterLink, FormField],
  template: `
    <h1 class="text-2xl font-semibold">{{ id() ? 'Edit series' : 'Add a series' }}</h1>

    @if (conflictMessage(); as message) {
      <div class="mt-4 rounded-md border border-status-dropped-fg/40 bg-status-dropped-bg p-4">
        <p class="text-status-dropped-fg">{{ message }}</p>
        <div class="mt-2 flex gap-3 text-sm">
          @if (id(); as seriesId) {
            <a [routerLink]="['/series', seriesId, 'history']" class="underline">
              Review the changes
            </a>
          }
          <button type="button" class="underline" (click)="reloadAndDiscardMyChanges()">
            Reload and discard my changes
          </button>
        </div>
      </div>
    }

    <form (submit)="onSubmit($event)" class="mt-6 space-y-4">
      <div>
        <label for="name" class="block text-sm font-medium">Name</label>
        <input
          id="name"
          type="text"
          [formField]="seriesForm.name"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
        @for (error of seriesForm.name().errors(); track error.kind) {
          <p class="mt-1 text-sm text-status-dropped-fg">{{ error.message }}</p>
        }
      </div>

      <div>
        <label for="sortName" class="block text-sm font-medium">Sort name</label>
        <input
          id="sortName"
          type="text"
          [formField]="seriesForm.sortName"
          placeholder="e.g. Expanse, The"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        />
      </div>

      <div>
        <label for="description" class="block text-sm font-medium">Description</label>
        <textarea
          id="description"
          [formField]="seriesForm.description"
          rows="4"
          class="mt-1 w-full rounded-sm border border-border px-3 py-1.5"
        ></textarea>
      </div>

      @if (formError(); as message) {
        <p class="text-sm text-status-dropped-fg">{{ message }}</p>
      }

      <button
        type="submit"
        [disabled]="seriesForm().submitting()"
        class="rounded-sm border border-border px-4 py-2"
      >
        {{ id() ? 'Save changes' : 'Add series' }}
      </button>
    </form>
  `,
})
export class SeriesFormPage {
  readonly id = input<string>();

  private readonly seriesApi = inject(SeriesApi);
  private readonly router = inject(Router);

  readonly model = signal<SeriesFormModel>({ ...BLANK_MODEL });
  readonly loadedVersion = signal<number | null>(null);
  readonly conflictMessage = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  readonly existing = httpResource<SeriesDetail>(() =>
    this.id() ? `/api/v1/series/${this.id()}` : undefined,
  );

  readonly seriesForm = form(this.model, (p) => {
    required(p.name, { message: 'Name is required.' });
  });

  constructor() {
    effect(() => {
      if (!this.existing.hasValue()) return;
      if (this.loadedVersion() !== null) return;
      const series = this.existing.value();
      untracked(() => {
        this.model.set({
          name: series.name,
          sortName: series.sortName ?? '',
          description: series.description ?? '',
        });
        this.loadedVersion.set(series.version);
      });
    });
  }

  private toApiInput(model: SeriesFormModel) {
    return {
      name: model.name,
      sortName: model.sortName === '' ? null : model.sortName,
      description: model.description === '' ? null : model.description,
    };
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.seriesForm, async () => {
      this.formError.set(null);
      this.conflictMessage.set(null);
      try {
        const input = this.toApiInput(this.model());
        const seriesId = this.id();
        if (seriesId === undefined) {
          const created = await firstValueFrom(this.seriesApi.create(input));
          await this.router.navigate(['/series', created.id]);
        } else {
          const version = this.loadedVersion();
          if (version === null) return undefined;
          const updated = await firstValueFrom(
            this.seriesApi.update(seriesId, { ...input, expectedVersion: version }),
          );
          await this.router.navigate(['/series', updated.id]);
        }
        return undefined;
      } catch (err) {
        if (err instanceof HttpErrorResponse) {
          const conflict = readSaveConflict(err);
          if (conflict) {
            this.conflictMessage.set(
              'Someone else edited this series while you were working — review the changes.',
            );
            return undefined;
          }
        }
        this.formError.set('Could not save this series — please try again.');
        return undefined;
      }
    });
  }

  reloadAndDiscardMyChanges(): void {
    this.loadedVersion.set(null);
    this.conflictMessage.set(null);
    this.existing.reload();
  }
}
