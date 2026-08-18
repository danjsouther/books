import { Component, model } from '@angular/core';
import { MatButtonToggleModule, type MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

export type ListView = 'list' | 'grid';

/**
 * Layout switch for a results list. Built on the same `MatButtonToggleGroup` as
 * `select.ts` but deliberately without that component's click-to-deselect
 * workaround: a view is always chosen, so single-select semantics with no
 * "nothing selected" state are exactly right here, and the group's own
 * `(change)` — which only fires on a real change — is all this needs.
 */
@Component({
  selector: 'app-view-toggle',
  imports: [MatButtonToggleModule, MatIconModule],
  template: `
    <mat-button-toggle-group
      hideSingleSelectionIndicator
      aria-label="View"
      [value]="value()"
      (change)="onChange($event)"
    >
      <mat-button-toggle value="list" aria-label="List view">
        <mat-icon>view_list</mat-icon>
      </mat-button-toggle>
      <mat-button-toggle value="grid" aria-label="Grid view">
        <mat-icon>view_module</mat-icon>
      </mat-button-toggle>
    </mat-button-toggle-group>
  `,
})
export class ViewToggle {
  readonly value = model<ListView>('list');

  protected onChange(event: MatButtonToggleChange): void {
    this.value.set(event.value as ListView);
  }
}
