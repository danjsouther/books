import { NgOptimizedImage } from '@angular/common';
import { booleanAttribute, Component, computed, input } from '@angular/core';

/**
 * A book's cover art, or a same-sized placeholder when there isn't one. Sizing
 * the fallback identically is the whole point: a page of books is mostly covers,
 * and a missing one that collapsed to nothing would ragged the row or tile it
 * sits in.
 *
 * The host box is exactly `width` wide by default, and the image fills it at the
 * declared aspect ratio — so a consumer that wants a fluid cover overrides the
 * host width alone (`app-book-cover { width: 100% }`) and the height follows,
 * with no `::ng-deep` reach into these styles.
 */
@Component({
  selector: 'app-book-cover',
  imports: [NgOptimizedImage],
  host: {
    '[style.width.px]': 'width()',
    '[style.--cover-ratio]': 'ratio()',
  },
  template: `
    @if (src(); as url) {
      <img
        [ngSrc]="url"
        [alt]="decorative() ? '' : 'Cover of ' + title()"
        [width]="width()"
        [height]="height()"
        class="cover"
      />
    } @else {
      <div class="no-cover" aria-hidden="true">
        @if (width() >= 100) {
          No cover
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
      flex: none;
    }

    .cover,
    .no-cover {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: var(--cover-ratio);
      border-radius: 8px;
    }

    .cover {
      border: 1px solid var(--mat-sys-outline-variant);
      object-fit: cover;
    }

    .no-cover {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed var(--mat-sys-outline-variant);
      font-size: 0.75rem;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BookCover {
  readonly src = input<string | null>(null);
  readonly title = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** Set when the cover sits inside a link that already names the book — an
   *  "Cover of X" alt there would make the link announce the title twice. */
  readonly decorative = input(false, { transform: booleanAttribute });

  protected readonly ratio = computed(() => `${this.width()} / ${this.height()}`);
}
