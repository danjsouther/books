import { httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { FieldDiff, ListResponse, RevisionSummary } from '@books/domain';
import { Flash } from '../../core/flash';
import { DiffList } from '../../shared/ui/diff-list';
import { Pagination } from '../../shared/ui/pagination';
import { BooksApi } from './books-api';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-book-history-page',
  imports: [RouterLink, DiffList, Pagination],
  template: `
    <h1 class="text-2xl font-semibold">History</h1>
    <p class="mt-1 text-sm">
      <a [routerLink]="['/books', id()]" class="underline">Back to book</a>
    </p>

    @if (revisions.hasValue()) {
      <ul class="mt-4 divide-y divide-border">
        @for (revision of revisions.value().items; track revision.version) {
          <li class="py-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-medium">Version {{ revision.version }}</span>
                — {{ revision.changeKind }}
                @if (revision.changedAt) {
                  <span class="text-sm text-ink-muted">{{ revision.changedAt }}</span>
                }
              </div>
              <div class="flex gap-3 text-sm">
                <button type="button" class="underline" (click)="toggle(revision.version)">
                  {{ expandedVersion() === revision.version ? 'Hide diff' : 'Show diff' }}
                </button>
                @if (revision.version > 1) {
                  <button type="button" class="underline" (click)="restore(revision.version)">
                    Restore this version
                  </button>
                }
              </div>
            </div>
            @if (expandedVersion() === revision.version) {
              <div class="mt-3">
                @if (diff.hasValue()) {
                  <app-diff-list [diffs]="diff.value()" />
                } @else {
                  <p class="text-sm text-ink-muted">Loading diff…</p>
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
})
export class BookHistoryPage {
  readonly id = input.required<string>();

  private readonly booksApi = inject(BooksApi);
  private readonly router = inject(Router);
  private readonly flash = inject(Flash);

  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly revisions = httpResource<ListResponse<RevisionSummary>>(() => ({
    url: `/api/v1/books/${this.id()}/revisions`,
    params: { page: this.page(), pageSize: PAGE_SIZE, dir: 'desc' },
  }));

  protected readonly expandedVersion = signal<number | null>(null);

  /** Fetched lazily per expanded row, not for every revision up front. */
  protected readonly diff = httpResource<FieldDiff[]>(() => {
    const version = this.expandedVersion();
    if (version === null || version <= 1) return undefined;
    return `/api/v1/books/${this.id()}/revisions/${version}/diff?against=${version - 1}`;
  });

  protected toggle(version: number): void {
    this.expandedVersion.set(this.expandedVersion() === version ? null : version);
  }

  protected restore(toVersion: number): void {
    this.booksApi.revert(this.id(), toVersion).subscribe({
      next: () => {
        this.flash.show(`Restored version ${toVersion}.`);
        void this.router.navigate(['/books', this.id()]);
      },
      error: () => this.flash.show('Could not restore this version — please try again.'),
    });
  }
}
