# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added — The database (2026-08-15)

The full schema now exists: members, the book and series catalog, per-member
reading status and rating, revision history for every catalog record, the activity
feed, and the tables authentication will need. Migrations are generated from the
schema and the SQL is committed, so what is deployed is always something a person
reviewed. `npm run db:seed` builds a realistic fixture set — every release
precision, a decimal-numbered novella, trashed records, a record deleted and then
restored — used by development and, later, by the browser tests.

Versioning, revision history, and deletion are deliberately one mechanism rather
than three features. Every change to a book or series bumps a version, appends a
complete snapshot, and is written in a single transaction, so history can never
disagree with the record. Deletion is simply another version, which is what makes
it reversible and keeps the whole sequence of deletions and restorations intact.
That version doubles as a concurrency check, so two people editing the same book
no longer means one silently overwrites the other.

Anyone may edit or delete anything, and that is only safe because nothing is lost.
Every write goes through one helper that holds a lock on the record's name while
it checks for duplicates, so two people creating the same series at the same moment
get one series and one clear message rather than two rows.

Uniqueness is enforced over live records only. An earlier design keyed it on the
version number instead; that turned out to allow a name to be recycled exactly
once and then never again, and it did not actually prevent two live records from
sharing a name. Both failures are now covered by tests. See
[docs/data-model.md](docs/data-model.md).

### Changed — Room for a server and shared code (2026-08-15)

The web application moved from `src/` into `apps/web/`, making room alongside it
for `apps/server` — an Express process that will host `/api/v1` and serve the
built browser bundle — and for shared packages under `packages/`. It answers
`/api/v1/health` and nothing else so far; the database and authentication follow.

This stays a single npm package. Internal boundaries are drawn with TypeScript
path aliases pointing straight at source, so there is no build step between
packages and no workspace machinery to fight with the Angular CLI. The boundary
that matters is enforced by the compiler: the browser app can import
`@books/domain` and cannot reach server-only code at all.

`npm run dev` now runs the application and the API together, with the dev server
proxying `/api` so the browser only ever sees one origin. `npm start` runs the
built server, which serves hashed assets as immutable for a year, `index.html` as
`no-store`, and the application shell for any deep link — so a hard refresh on a
book page works, and a deploy never strands a returning visitor on a cached page
pointing at bundles that no longer exist.

### Added — Project foundation (2026-08-15)

Turned the bare scaffold into something that can safely be built on. TypeScript
now runs fully strict, with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` on and Angular's `strictTemplates` enabled — all
far cheaper to adopt now than after the app has grown. ESLint arrives configured
with type-aware rules, template accessibility checks, and rules encoding this
project's Angular conventions, and continuous integration now gates formatting,
linting, and type checking alongside the existing build and tests.

Tailwind CSS supplies styling, with the palette and the five reading-status
colours defined as design tokens. The stock Angular welcome page is replaced by
the real application shell: a skip link, header navigation, a focusable main
region, and a live region that announces route changes to screen readers.
Documentation now covers the architecture decisions and the backlog.

### Changed — Client-side rendering only (2026-08-15)

Removed server-side rendering. Every page in this application sits behind a
Discord login, so there is nothing to render for an anonymous visitor and no
search engine to serve — while per-user server rendering brings real risk, since
HTML that varies by member must never be cached or handed to the wrong person.

Dropping it removes hydration, transfer state, and host allow-listing from the
deployment, and leaves a single browser bundle as the only build artifact. That
artifact is also what a future desktop client will load, so the desktop path
cannot quietly break. The cost is a blank first paint until the application
boots, which is acceptable for a private tool.

### Added — Continuous integration (2026-08-14)

Every push and pull request against `main` or `dev` now builds the application
and runs the unit tests on GitHub Actions, so a branch cannot be merged without
a green build. The job is the status check that the branch protection rules
require.

### Added — Angular workspace (2026-08-14)

Scaffolded the books application as an Angular 22 workspace: standalone APIs
with zoneless change detection, routing, SCSS component styles, Vitest as the
unit test runner, and server-side rendering with prerendering. `ng build`
produces both browser and server bundles.
