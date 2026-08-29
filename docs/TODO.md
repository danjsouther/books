# TODO / Roadmap

Backlog of larger initiatives not yet scheduled. Each is a multi-step effort —
plan it out (explore the relevant code, ask clarifying questions, write an
implementation plan) before starting work on it.

Grouped by priority. High = do next; Medium = queued behind it; Low = deferred,
not now. Priority reflects when it gets picked up, not size or importance —
read an entry's own notes for prerequisites rather than inferring them from the
tier.

## High

## Medium

- [ ] **Ship an Electron desktop client**

  ```
  The Angular build is browser-only: `angular.json` -> projects.books.architect.build
  has no `server`/`ssr`/`outputMode` keys and emits a plain SPA to `dist/web`
  (verified by `npm run build`). That bundle is already exactly what an Electron
  renderer would load, so no separate build configuration is needed — this was
  the main structural blocker and it is gone.

  What is missing is everything around it: there is no `main`/`preload` process,
  no packaging step, no custom-protocol or loopback registration, and no way for
  the renderer to reach an API on a different origin. `apps/web/src/app/app.config.ts`
  now registers `withInterceptors([authInterceptor])` (added for silent token
  refresh — `apps/web/src/app/core/auth-interceptor.ts`), but that interceptor
  and every request it wraps still resolve relative to the page origin; nothing
  sets an absolute base URL, so this is still fine for the web app and still
  useless for a packaged client that must talk to the homelab host.

  Wanted: a packaged desktop client that signs in with Discord and talks to the
  same `/api/v1` as the web app.

  Phase 3 built the server half — PKCE, token issuance, refresh rotation — with a
  `client=web|desktop` distinction already threaded through `oauth_states` and
  `refresh_tokens`. Until this exists, `client=desktop` at
  `/auth/discord/callback` returns the token pair as JSON directly (see
  `packages/api/src/routes/auth.ts`), because there is no loopback listener or
  registered protocol to redirect to yet. That branch is real and tested against
  a fake Discord client; only the handoff mechanism below is missing.

  Open decisions: loopback `http://127.0.0.1:<ephemeral>/callback` vs a custom
  `books://auth` protocol for the OAuth redirect; whether the desktop build points
  at a compile-time host, a user-entered one, or discovers it; where the access
  token lives (`safeStorage` vs keytar vs in-memory only); and whether the desktop
  client ships its own auto-update channel or is installed manually.
  ```

## Low
