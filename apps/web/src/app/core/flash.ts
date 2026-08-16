import { Service, signal } from '@angular/core';

export interface FlashMessage {
  readonly message: string;
  readonly undo?: (() => void) | undefined;
}

const AUTO_CLEAR_MS = 8000;

/** A single transient, polite-`aria-live` banner — mounted once in `app.html` so
 *  it survives the navigation a delete triggers (detail page → list page). One
 *  shared instance rather than a per-page toast, since only one message is ever
 *  relevant at a time in this app. */
@Service()
export class Flash {
  private readonly current = signal<FlashMessage | null>(null);
  readonly message = this.current.asReadonly();
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string, undo?: () => void): void {
    clearTimeout(this.timer);
    this.current.set({ message, undo });
    this.timer = setTimeout(() => this.current.set(null), AUTO_CLEAR_MS);
  }

  clear(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}
