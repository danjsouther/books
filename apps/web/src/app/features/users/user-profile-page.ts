import { Component, input } from '@angular/core';

/** The real profile page (status counts, shelf) is Phase 8. */
@Component({
  selector: 'app-user-profile-page',
  imports: [],
  template: `<h1 class="text-2xl font-semibold">Member {{ id() }}</h1>`,
})
export class UserProfilePage {
  readonly id = input.required<string>();
}
