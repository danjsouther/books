import { Component, input } from '@angular/core';

/** The real profile page (status counts, shelf) is Phase 8. */
@Component({
  selector: 'app-user-profile-page',
  imports: [],
  template: `<h1>Member {{ id() }}</h1>`,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0;
    }
  `,
})
export class UserProfilePage {
  readonly id = input.required<string>();
}
