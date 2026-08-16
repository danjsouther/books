# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
