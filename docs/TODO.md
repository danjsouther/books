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

- [ ] **Build and publish Docker images from CI**

  ```
  `Dockerfile` builds three targets (`server`, `bot`, `migrate` — see
  `docs/architecture.md`'s "Deployment" section) and all three are confirmed
  working: built locally and run end to end via `docker-compose.yml`
  (Postgres → migrate → server + bot, `books_bot`'s read-only grant verified
  by hand). `.github/workflows/ci.yml` only compiles the app
  (`build`/`build:bot`/`build:migrate`) — it never runs `docker build`, and
  nothing pushes an image anywhere.

  Wanted: CI builds all three targets on merge to `main` (or on a tag) and
  pushes them to a registry, so a deployment pulls a known-good image
  instead of building on the host.

  Open decisions: which registry (GHCR is the obvious default for a
  GitHub-hosted repo, needs no separate account); tagging scheme (git SHA,
  semver tag, `latest`, or some combination); whether this needs
  multi-platform builds (`linux/amd64` vs `linux/arm64`, depending on what
  the homelab host actually runs) or a single target platform is fine;
  whether image builds should block merging (a CI job) or only run
  after (a separate release workflow).
  ```

- [ ] **Add a `/book <title>` Discord command**

  ```
  `apps/bot/src/commands/upcoming.ts` is the only slash command that exists —
  it lists releases in a window, not a single book. There is no command that
  looks up one book by title and shows its detail (cover, series, release
  date, community rating) the way `apps/web`'s `BookDetailPage`
  (`apps/web/src/app/features/books/book-detail-page.ts`) does.

  `packages/db`'s `listUpcomingReleases` (`packages/db/src/queries/releases.ts`)
  and `listSeries`'s `q`-search pattern (`packages/db/src/queries/series.ts`)
  are the closest existing building blocks — a books-by-title search doesn't
  exist yet at the query layer either (`GET /books?q=` searches titles via the
  API, but the bot talks to `packages/db` directly, per Phase 9's pattern, not
  through HTTP).

  Wanted: `/book <title>` with autocomplete (mirroring `/upcoming`'s `series`
  option's `listSeries`-backed autocomplete), replying with an embed built the
  same way `apps/bot/src/format/embeds.ts` builds `/upcoming`'s.

  Open decisions: what happens on more than one title match (a picker via
  autocomplete resolving to an id, the way `/upcoming series` already does, or
  a "did you mean" list in the reply); whether the embed shows the viewer's
  own shelf status when the caller is a linked member (`findUserByDiscordId`,
  added in Phase 9, already answers "is this caller linked").
  ```

- [ ] **Add a `/shelf @user` Discord command**

  ```
  `packages/db/src/queries/users.ts`'s `listUserShelf(db, userId, filters)`
  already powers the web app's member-profile shelf view and supports
  `status`/`seriesId`/`q` filters and `updated`/`title`/`rating`/`release`
  sort — it is a ready-made query, not something that needs building from
  scratch. What's missing is the Discord side: no command resolves a mentioned
  Discord user to an app user (the join is `findUserByDiscordId`, added in
  Phase 9 for `/upcoming mine:true`, directly reusable here) or formats a
  shelf as an embed.

  Wanted: `/shelf @user` (or with no mention, the caller's own shelf), optional
  `status` filter, replying with an embed grouped or sorted the way the web
  profile page presents it.

  Open decisions: what an unlinked mentioned user gets (an ephemeral "they
  haven't signed in" reply, mirroring `/upcoming`'s `mine:true` gate,
  vs. silently empty); pagination shape if a shelf is larger than one embed's
  6000-character budget (`apps/bot/src/format/embeds.ts`'s truncation logic is
  the template to reuse, not reinvent).
  ```

- [ ] **Post `book.released` events to a Discord channel**

  ```
  `apps/server/src/jobs/releases.ts`'s `runReleaseAnnouncementJob` already
  writes a `book.released` activity row (`packages/db/src/schema/activity.ts`)
  the moment a day-precision book's release date arrives, idempotently. That
  event only reaches the web app's activity feed
  (`apps/web/src/app/features/activity/activity-page.ts`) today — nothing
  posts it to Discord.

  Wanted: the bot (or the server job itself, via a bot-owned webhook/channel
  send) announces each new `book.released` row to a configured channel.

  Open decisions: this needs a `guild_settings` table (announcement channel
  id per guild) that doesn't exist yet — no schema work has started; whether
  the release job posts directly (coupling `apps/server` to Discord) or the
  bot polls/subscribes to new `book.released` rows on some interval instead
  (keeping the coupling one-directional, bot → DB, the way every other bot
  query already works); message format (reuse `apps/bot/src/format/embeds.ts`
  or a plain announcement string, since a full embed may be overkill for one
  book).
  ```

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

- [x] **Verify the design token contrast ratios against real measurements**

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

  Done: `tailwind.css` and its `@theme` token block no longer exist — the
  Angular Material migration replaced them with M3 color roles defined in
  `styles.scss` (`--status-plan-container`/`-on-container` etc., one pair per
  reading status). The container/on-container text-contrast ratios were
  computed by hand (OKLCH → sRGB → WCAG relative luminance) rather than eyeballed:
  all five pairs clear 7:1, well past the 4.5:1 minimum. The container fill
  itself can't also clear 3:1 against a white `--mat-sys-surface` at M3
  container lightness without going dark enough to stop reading as an M3
  container, so status chips (`chip.ts`) render a 1px border in the
  on-container color for boundary perceivability instead. Not done: no
  automated check keeps these measured going forward — a regression would
  still only surface via manual recomputation or an axe pass. Dark theme
  remains undecided.
  ```

## Low

- [x] **Re-verify the `@angular/aria` API on every version bump**

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

  Done: moot rather than solved — the Angular Material migration removed
  `@angular/aria` from the dependency tree entirely. `combobox.ts` and
  `select.ts` (shared/ui) now sit on `MatAutocomplete`/`MatButtonToggleGroup`;
  the calendar (`calendar-page.ts`) was rebuilt as a plain CSS Grid of day
  cells with no keyboard-grid navigation, since arrow-key 2D nav across days
  was explicitly dropped as a requirement for this migration. There is no
  longer a Grid/Listbox/Combobox API surface in this repo to re-verify on
  version bumps.
  ```
