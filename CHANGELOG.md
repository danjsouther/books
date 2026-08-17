# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed — Follow the OS color-scheme preference (2026-08-17)

The app now renders using Material's light/dark tokens driven by the
browser's `prefers-color-scheme`, instead of always rendering light. The
custom reading-status container colors gained matching dark-mode variants
so status chips keep their verified contrast in both themes.

### Changed — Drop Changes from primary navigation (2026-08-17)

The Changes route and its backing revision history stay intact — book and
series History pages and Restore still depend on them — but it's no longer
a primary nav destination, which was overkill for a small group of friends.
The footer tagline was updated to match.

### Changed — Debounce status and rating updates (2026-08-17)

Clicking through several statuses or ratings in a row previously fired one
PATCH per click. Status and rating changes now flow through a debounced
Subject and settle to a single request 600ms after the last click. A failed
save rolls back to the last server-confirmed value rather than whatever was
clicked immediately before it, staying correct even mid-burst.

### Fixed — Enter not adding an author with no matching suggestion (2026-08-17)

MatAutocomplete's own keydown handling on the shared input swallowed Enter
before MatChipInput's `matChipInputTokenEnd` ever fired, so typing a name
with no matching suggestion and pressing Enter cleared the input without
adding anything.

### Changed — Collapse same-day activity into one row (2026-08-17)

A member clicking through several statuses or ratings for the same book on
the same UTC day previously produced one activity-feed row per click. The
feed now keeps at most one status-changed/rating-changed row per member,
book, and day across everything loaded so far, including across a "Load
more" page boundary.

### Added — Sort-direction toggle for list filters (2026-08-17)

The list toolbar gains an explicit ascending/descending toggle next to the
sort select, defaulting to whichever direction each sort option declares as
natural (e.g. name ascending, recently-updated descending), wired through
the books, series, and trash lists. The combobox and toolbar search field
also gained a clear (x) button once they hold a value.

### Changed — Click-to-deselect for single-select toggles (2026-08-17)

Material's single-selector button-toggle group always keeps the clicked
toggle checked, with no native click-to-deselect. The rating widget and the
filter chip row now clear their own value on a re-click of the
already-pressed option.

### Added — Sort the book list by average rating (2026-08-17)

Sorting uses a correlated subquery averaging each book's shelf ratings,
NULLS LAST in both directions so an unrated book never outranks a
top-rated one under descending order.

### Fixed — Boolean query-string filters coercing "false" to true (2026-08-17)

`z.coerce.boolean()` runs `Boolean(x)`, so the string encoding of a JS
`false` came back `true` on the server — every request with `mine=false` or
`includeDeleted=false` was silently filtered as if it were `true`.

### Changed — Rebuild the web UI on Angular Material (2026-08-17)

Replaced Tailwind and `@angular/aria` entirely with Angular Material
components and an M3 theme across every page and shared UI primitive.

### Changed — Multi-word search (2026-08-17)

A member can now find a book, series, or author by any word in its name,
not just a leading substring.

## 0.1.0 - 2026-08-16

Initial release: a private, Discord-gated reading tracker with a web app,
an API, a Discord bot, and a Docker Compose deployment.

### Added

- **Discord login.** Members sign in with Discord; leaving the configured
  guild revokes access on the next login, with no separate invite flag to
  fall out of sync. Short-lived access tokens plus rotating, single-use
  refresh tokens back both cookie and bearer transport, with CSRF protection
  on every mutating request.
- **Books and series**, with full revision history. Create, edit, delete,
  restore, and revert are all versioned — a delete is just another version,
  so nothing is ever truly lost, and two people editing the same record
  concurrently is a handled conflict, not a silent overwrite. A field-level
  diff between any two versions, and a shared trash page with inline Undo.
- **A personal shelf.** Reading status and rating per book, doubling as the
  source for "my upcoming releases" and a per-member profile page.
- **A release calendar and list.** A keyboard-navigable month calendar and a
  chronological release list, both grouped by how much of a release date is
  actually known (day, month, year, or unannounced), with a one-click "Plan"
  toggle shared between them.
- **Activity and changes feeds.** What people are doing (status changes,
  ratings, a release day arriving) and what the catalog has become (every
  edit, with a diff and a one-click revert on the row itself), each with its
  own noise-control rule so a burst of edits doesn't flood the page.
- **A release-announcement job**, idempotent across restarts, that never
  double-announces and never treats a backdated historical addition as a
  new release.
- **A Discord bot**, sharing the same database as the web app, with an
  `/upcoming` command for release windows, filterable by series and to a
  member's own planned books.
- **Docker Compose deployment**: one multi-stage image for the server, the
  bot, and a one-shot migration step, with the bot connecting to Postgres
  as a genuinely read-only role rather than a trusted-by-convention one.
- The project foundation underneath all of the above: strict TypeScript,
  linting with accessibility checks, CI on every push and pull request, and
  a schema-first Postgres data model with committed, reviewed migrations.

See [docs/architecture.md](docs/architecture.md) for the reasoning behind
the notable decisions along the way, [docs/data-model.md](docs/data-model.md)
for the schema, and [docs/api.md](docs/api.md) for the full API surface.
