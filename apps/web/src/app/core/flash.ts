import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const AUTO_CLEAR_MS = 8000;

/** A single transient, polite-`aria-live` message, shown via Material's
 *  `MatSnackBar` (its host is announced with `role="status"`/`aria-live`
 *  out of the box). One shared instance rather than a per-page toast, since
 *  only one message is ever relevant at a time in this app — `open()`
 *  dismisses any message already showing before showing the new one. */
@Service()
export class Flash {
  private readonly snackBar = inject(MatSnackBar);

  show(message: string, undo?: () => void): void {
    const ref = this.snackBar.open(message, undo ? 'Undo' : undefined, {
      duration: AUTO_CLEAR_MS,
    });
    if (undo) {
      ref.onAction().subscribe(() => undo());
    }
  }

  clear(): void {
    this.snackBar.dismiss();
  }
}
