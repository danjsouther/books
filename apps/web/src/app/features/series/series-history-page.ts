import { httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { FieldDiff, ListResponse, RevisionSummary } from '@books/domain';
import { Flash } from '../../core/flash';
import { DiffList } from '../../shared/ui/diff-list';
import { Pagination } from '../../shared/ui/pagination';
import { SeriesApi } from './series-api';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-series-history-page',
  imports: [RouterLink, DiffList, Pagination],
  template: `
    <h1>History</h1>
    <p class="back-link">
      <a [routerLink]="['/series', slug()]">Back to series</a>
    </p>

    @if (revisions.hasValue()) {
      <ul class="list">
        @for (revision of revisions.value().items; track revision.version) {
          <li class="row">
            <div class="row-header">
              <div>
                <span class="version">Version {{ revision.version }}</span>
                — {{ revision.changeKind }}
              </div>
              <div class="row-actions">
                <button type="button" class="link-btn" (click)="toggle(revision.version)">
                  {{ expandedVersion() === revision.version ? 'Hide diff' : 'Show diff' }}
                </button>
                @if (revision.version > 1) {
                  <button type="button" class="link-btn" (click)="restore(revision.version)">
                    Restore this version
                  </button>
                }
              </div>
            </div>
            @if (expandedVersion() === revision.version) {
              <div class="diff">
                @if (diff.hasValue()) {
                  <app-diff-list [diffs]="diff.value()" />
                } @else {
                  <p class="muted">Loading diff…</p>
                }
              </div>
            }
          </li>
        }
      </ul>
      <app-pagination
        [page]="page()"
        [pageSize]="pageSize"
        [total]="revisions.value().total"
        (goToPage)="page.set($event)"
      />
    }
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }

    .back-link {
      margin-top: 0.25rem;
      font-size: 0.875rem;
    }

    a {
      color: var(--mat-sys-primary);
    }

    .list {
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
    }

    .row {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .row-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .version {
      font-weight: 600;
    }

    .muted {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .row-actions {
      display: flex;
      gap: 0.75rem;
      font-size: 0.875rem;
    }

    .link-btn {
      color: var(--mat-sys-primary);
      text-decoration: underline;
      background: none;
      border: none;
      cursor: pointer;
      font: inherit;
    }

    .diff {
      margin-top: 0.75rem;
    }
  `,
})
export class SeriesHistoryPage {
  readonly slug = input.required<string>();

  private readonly seriesApi = inject(SeriesApi);
  private readonly router = inject(Router);
  private readonly flash = inject(Flash);

  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly revisions = httpResource<ListResponse<RevisionSummary>>(() => ({
    url: `/api/v1/series/${this.slug()}/revisions`,
    params: { page: this.page(), pageSize: PAGE_SIZE, dir: 'desc' },
  }));

  protected readonly expandedVersion = signal<number | null>(null);

  protected readonly diff = httpResource<FieldDiff[]>(() => {
    const version = this.expandedVersion();
    if (version === null || version <= 1) return undefined;
    return `/api/v1/series/${this.slug()}/revisions/${version}/diff?against=${version - 1}`;
  });

  protected toggle(version: number): void {
    this.expandedVersion.set(this.expandedVersion() === version ? null : version);
  }

  protected restore(toVersion: number): void {
    this.seriesApi.revert(this.slug(), toVersion).subscribe({
      next: () => {
        this.flash.show(`Restored version ${toVersion}.`);
        void this.router.navigate(['/series', this.slug()]);
      },
      error: () => this.flash.show('Could not restore this version — please try again.'),
    });
  }
}
