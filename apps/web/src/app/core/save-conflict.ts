import type { HttpErrorResponse } from '@angular/common/http';

export interface SaveConflict {
  readonly isStaleVersion: boolean;
  readonly currentVersion?: number | undefined;
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: { readonly reason?: string; readonly currentVersion?: number };
  };
}

/** Reads the exact shape `staleVersion()` (`packages/domain/src/errors.ts`)
 *  produces on a `409`, so a form can tell "someone else edited this while I
 *  was working" apart from every other kind of save failure. Returns `null`
 *  for a non-conflict error — the caller falls back to a generic message. */
export function readSaveConflict(err: HttpErrorResponse): SaveConflict | null {
  if (err.status !== 409) return null;
  const body = err.error as ApiErrorBody | null;
  if (body?.error?.details?.reason !== 'stale_version') return null;
  return { isStaleVersion: true, currentVersion: body.error.details.currentVersion };
}
