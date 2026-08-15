# TODO / Roadmap

Backlog of larger initiatives not yet scheduled. Each is a multi-step effort —
plan it out (explore the relevant code, ask clarifying questions, write an
implementation plan) before starting work on it.

Grouped by priority. High = do next; Medium = queued behind it; Low = deferred,
not now. Priority reflects when it gets picked up, not size or importance —
read an entry's own notes for prerequisites rather than inferring them from the
tier.

## High

_(Empty. The phased build-out of the app itself is tracked in its implementation
plan, not here — this file is for work that falls outside that plan.)_

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
  the renderer to reach an API on a different origin. `src/app/app.config.ts`
  registers `provideHttpClient(withFetch())` with no interceptors at all, so every
  request will resolve relative to the page origin — fine for the web app, useless
  for a packaged client that must talk to the homelab host.

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

- [ ] **Verify the design token contrast ratios against real measurements**

  ```
  `src/tailwind.css` defines the palette in an `@theme` block — `--color-ink`,
  `--color-ink-muted`, `--color-focus`, `--color-border`, and five
  `--color-status-*-bg` / `--color-status-*-fg` pairs for the reading statuses.
  The file's own header comment states the contract these values must meet: 4.5:1
  for each `-fg` against its `-bg`, 3:1 for each `-bg` against `--color-surface`,
  and 3:1 for `--color-focus` against every background it can land on.

  Those values were authored by eye against the oklch lightness axis and have not
  been measured. Nothing currently renders a status chip, so the gap is not yet
  visible, but every chip built later inherits whatever is wrong here — and axe
  checks rendered contrast, so this surfaces as a wall of failures in the e2e
  accessibility pass rather than as one fixable finding.

  Wanted: measured values, and something that keeps them measured.

  Open decisions: whether to verify once by hand or add an automated check (a
  unit test over the token values, or leaving it to the axe pass on rendered
  chips); whether to commit to a dark theme now — doing so doubles the palette
  and is much cheaper to decide before the tokens are consumed than after.
  ```

## Low

- [ ] **Re-verify the `@angular/aria` API on every version bump**

  ```
  `@angular/aria@22.1.2` is a dependency and the calendar depends on its Grid.
  Reading `node_modules/@angular/aria/types/grid.d.ts` during setup turned up a
  constraint that is not obvious from the guide: `GridCell._widget` is a
  `contentChild` with `first: true`, so a cell hosts exactly ONE
  `ngGridCellWidget`. Markup that puts the directive on each link inside a day
  cell binds only the first and silently strands the rest outside the grid's
  keyboard model. The workaround — a single `widgetType="complex"` wrapper per
  cell — is recorded in the implementation plan.

  The package is pre-1.0 and its directives are still moving. A minor bump could
  change the widget query, the `focusMode`/`rowWrap` inputs, or the cell `role`
  union, and the failure mode is a calendar that looks fine but is unusable by
  keyboard — which no build or unit test catches.

  Wanted: a deliberate re-read of the Grid, Listbox, and Combobox type
  definitions whenever the package version changes, rather than trusting semver.

  Open decisions: whether to pin the version exactly instead of using a caret
  range; whether the keyboard e2e spec is sufficient regression cover once it
  exists, or whether this needs its own upgrade checklist in the repo.
  ```
