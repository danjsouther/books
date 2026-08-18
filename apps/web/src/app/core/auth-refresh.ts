import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { RefreshResponse } from '@books/domain';
import { finalize, share, type Observable } from 'rxjs';

/**
 * Coalesces concurrent 401s into one `/auth/refresh` call. Several
 * `httpResource`/`HttpClient` requests can all expire in the same tick — without
 * this, each would rotate the same refresh token independently, and
 * `rotateSession`'s reuse-family detection would treat the second rotation as
 * theft and revoke the whole session. `share()` multicasts the single underlying
 * POST to every concurrent caller; `finalize` clears `inFlight` once that POST
 * settles (success or error) so the *next* 401, arriving after this one is done,
 * starts a fresh call rather than replaying a stale result.
 */
@Service()
export class AuthRefresh {
  private readonly http = inject(HttpClient);
  private inFlight: Observable<RefreshResponse> | null = null;

  refresh(): Observable<RefreshResponse> {
    if (this.inFlight !== null) return this.inFlight;

    const shared = this.http.post<RefreshResponse>('/api/v1/auth/refresh', {}).pipe(
      finalize(() => {
        this.inFlight = null;
      }),
      share(),
    );
    this.inFlight = shared;
    return shared;
  }
}
