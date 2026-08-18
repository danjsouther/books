import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
  imports: [RouterLink, FormField, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>{{ id() ? 'Edit series' : 'Add a series' }}</h1>

    @if (conflictMessage(); as message) {
      <div class="conflict-banner">
        <p class="conflict-message">{{ message }}</p>
        <div class="conflict-actions">
          @if (id(); as seriesId) {
            <a [routerLink]="['/series', seriesId, 'history']"> Review the changes </a>
          }
          <button type="button" class="link-btn" (click)="reloadAndDiscardMyChanges()">
            Reload and discard my changes
          </button>
        </div>
      </div>
    }

    <form (submit)="onSubmit($event)" class="form">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Name</mat-label>
        <input matInput id="name" type="text" [formField]="seriesForm.name" />
      </mat-form-field>
      @for (error of seriesForm.name().errors(); track error.kind) {
        <p class="field-error">{{ error.message }}</p>
      }

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Sort name</mat-label>
        <input
          matInput
          id="sortName"
          type="text"
          [formField]="seriesForm.sortName"
          placeholder="e.g. Expanse, The"
        />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Description</mat-label>
        <textarea
          matInput
          id="description"
          [formField]="seriesForm.description"
          rows="4"
        ></textarea>
      </mat-form-field>

      @if (formError(); as message) {
        <p class="field-error">{{ message }}</p>
      }

      <button mat-flat-button type="submit" [disabled]="seriesForm().submitting()">
        {{ id() ? 'Save changes' : 'Add series' }}
      </button>
    </form>
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .conflict-banner {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid var(--status-dropped-on-container);
      border-radius: 8px;
      background: var(--status-dropped-container);
    }

    .conflict-message {
      color: var(--status-dropped-on-container);
      margin: 0;
    }

    .conflict-actions {
      display: flex;
      gap: 0.75rem;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    a {
      color: var(--mat-sys-primary);
    }

    .link-btn {
      color: var(--mat-sys-primary);
      text-decoration: underline;
      background: none;
      border: none;
      cursor: pointer;
      font: inherit;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 1.5rem;
      max-width: 32rem;
    }

    .field-error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
      margin: -0.25rem 0 0.5rem;
    }
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
