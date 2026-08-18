import { Component } from '@angular/core';

/** The real shelf page (`MyShelfStore`) is Phase 8. */
@Component({
  selector: 'app-me-page',
  imports: [],
  template: `<h1>My shelf</h1>`,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }
  `,
})
export class MePage {}
