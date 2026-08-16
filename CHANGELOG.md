# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added — A Discord bot, with `/upcoming` (2026-08-16)

The app now has a presence in Discord itself, not just a login flow. `/upcoming`
lists releases in a chosen window (30/90/180/365 days, default 90), narrowable
to one series via autocomplete and, with `mine:true`, to only the books you've
marked as planned — replying ephemerally when it's just for you, publicly
otherwise. A Discord account that has never signed into the web app gets a
plain "you haven't signed in yet" reply rather than an empty or confusing
result. `include-tba` widens the list to books whose month or year is known
but not the exact day.

The bot is its own process (`apps/bot`), talking to the same database the web
app and API do rather than calling the API over the network — a design choice
that kept this phase from touching `apps/web` or `packages/api` at all. Slash
commands are registered with `npm run bot:deploy-commands`, run by hand,
never automatically on startup.

See [docs/architecture.md](docs/architecture.md) for why the bot needed its
own Discord client entirely separate from the web login flow's, and for how
Discord's hard embed limits (25 fields, 1024 characters per field, 6000
total) are enforced defensively rather than assumed safe.

### Added — Activity, changes, and the release job (2026-08-16)

Two new feeds, and the catalog now announces itself. The activity feed
(`/activity`, the landing page) is what people are doing — shelf changes,
ratings, and a release day arriving — in plain sentences, filterable by kind
and by member, loaded a page at a time with a "Load more" button rather than
infinite scroll. The changes feed (`/changes`) is what the catalog has
become: every create, edit, delete, restore, and revert, with a link straight
into that record's own diff view and a one-click Revert on the row itself. A
burst of edits to the same book by the same person within an hour collapses
into a single "edited 4 times" row instead of flooding the page.

A release job now runs once at boot and daily just after local midnight,
announcing any day-precision book whose release date has arrived — exactly
once, ever, even across restarts, and never for a historical book added long
after the fact.

Nothing changed in the API or database this time — both feeds' endpoints
already existed from Phase 4. What did surface, caught by real tests rather
than inspection: the release job's first backdating guard compared exact
instants instead of calendar dates and rejected books released only
yesterday; and every filter built on the shared `AppSelect` component,
including ones already shipped, had been silently self-selecting its first
option on load. Both are fixed; see
[docs/architecture.md](docs/architecture.md) for the detail.

### Added — The calendar and the release list (2026-08-16)

Book releases now have two homes: a month calendar with a release on every
day it lands, and a chronological release list grouped by month, with a
separate section for books whose year is known but not the month, and
another for books with no date at all yet. Both share one "Plan" toggle — a
real button, not an icon, that says outright what it does — so marking a
future book as something you're anticipating takes one click from either
view, with an immediate confirmation and no page reload. An "only my planned
releases" filter narrows either view to exactly that list.

The calendar is fully keyboard-navigable: arrow keys move between days, Page
Up/Down step a month at a time, Shift+Page Up/Down step a year, and
Ctrl+Home jumps back to today. Moving to a new month re-places focus on the
same day of the new month and announces the change and how many releases it
holds, rather than dropping focus back to the top of the page the way a
naive re-render would.

This is the first use of `@angular/aria`'s `Grid` anywhere in the app — see
[docs/architecture.md](docs/architecture.md) for what it needed (surprisingly
little) and for a focus-stealing bug the calendar's own test suite caught
before it shipped.

### Added — Books, series, and their history (2026-08-16)

Books and series now have a real interface: a filterable, paged list; a detail
page with a cover, series link, and everyone's shelf status and rating side by
side; a create/edit form; and a browsable revision history with a field-level
diff between any two versions and a one-click restore. Deleting either moves it
to a shared trash page rather than removing it, with an inline Undo and a
tombstone on the detail page in the meantime.

Saving while someone else has edited the same record is handled explicitly
rather than silently overwritten or silently lost: the form keeps exactly what
was typed, explains what happened, and links to the history to see what
changed. A shared, reusable list-filter toolbar, pagination, and a diff view now
exist for every future list and history page to reuse rather than rebuild.

This is also the first use of Signal Forms and `@angular/aria` anywhere in the
app — both had real gaps between their documented examples and their actual
runtime behavior, caught by writing tests rather than trusting the types. See
[docs/architecture.md](docs/architecture.md) for what those gaps were and what
this phase deliberately deferred.

### Added — The app shell and sign-in (2026-08-16)

The browser app can now sign in, navigate, and stay signed in across a refresh.
Every route except `/login` requires a session; visiting one without signing in
first lands on `/login` and returns to the original destination afterward, rather
than losing it. There is no client-readable session cookie by design, so the app
asks the server once on boot whether a visit is authenticated, and the whole
route tree waits on that answer before deciding what to show — never redirecting
a signed-in member to `/login` just because that answer hasn't arrived yet.

A shared list-store factory now exists for every collection page still to come:
one place that owns paging, a debounced search filter, and the loading state a
page needs, rather than each future books/series/trash page reimplementing the
same handful of signals. Every route in the app is wired up and reachable today
— the activity and changes feeds already render real data end to end — but most
are placeholders their real Phase 6-8 UI will replace; this phase is what proves
the routing, the session check, and the data-fetching plumbing all work before
there's a page worth building on top of them.

### Added — The API surface (2026-08-16)

Books, series, and authors now have a full API: create, edit, delete, restore, and
revert, plus a browsable revision history for both books and series with a diff
between any two versions. Every edit and delete is a version, never a rewrite, so
reverting a revert works and a soft-deleted record renders as a tombstone with a
Restore button rather than vanishing. A book's authors are part of that history too —
changing who wrote a book is an edit like any other, and appears in its diff.

Members now have a shelf: a status and a rating per book, which doubles as the
source for "my upcoming releases," a ratings summary on every book, and a member
profile page. Every shelf change writes an activity feed entry alongside it, in the
same transaction, so the feed can never disagree with the shelf. The calendar's data
now exists behind `/releases`, pre-bucketed by how much of a release date is actually
known — day, month, year, or nothing at all — so the calendar and a release list
render from the identical payload. A changes feed unions both catalog tables' history
into one reverse-chronological list, and a trash page lists everything currently
soft-deleted across books and series together.

Every collection endpoint shares one pagination contract — the same
`page`/`pageSize`/`sort`/`dir` params and the same envelope — except the activity
feed, which is paginated by cursor instead of page number, since it is the one list
being written to while someone might be reading it. Request validation runs through
Zod schemas that live in the shared, browser-safe package rather than the server
alone, so the same rule that rejects a bad request on the server will validate a form
in the browser before it is ever sent. See [docs/api.md](docs/api.md) for the full
surface and [docs/architecture.md](docs/architecture.md) for the reasoning behind it.

### Added — Discord login (2026-08-15)

Members sign in with Discord. The server validates guild membership against
Discord's own API on every login — leaving the guild is what revokes access,
there is no separate invited flag to fall out of sync. A short-lived access
token and a longer-lived, single-use-per-presentation refresh token replace any
notion of a server-side session; a refresh token that gets presented twice
(a sign it was stolen) revokes the entire chain it belongs to, not just the one
attempt. Discord's own tokens are never stored — they exist only for the two
calls that need them, then are discarded.

The web app authenticates with httpOnly cookies; nothing else can talk to the
API yet, but the same tokens work as a bearer header, so a future desktop client
needs no separate scheme. Every mutating request is checked against where it
actually came from — a matching double-submit cookie header, and a matching
`Origin` — so a malicious page cannot act on a signed-in member's behalf. The
environment is validated in full at boot: a missing Discord credential or a
weak signing secret fails the process immediately with every problem listed at
once, rather than surfacing as a confusing failure the first time someone logs
in. See [docs/architecture.md](docs/architecture.md).

### Added — The database (2026-08-15)

The full schema now exists: members, the book and series catalog, authors,
per-member reading status and rating, revision history for every catalog record,
the activity feed, and the tables authentication will need. Migrations are generated
from the schema and the SQL is committed, so what is deployed is always something a
person reviewed. `npm run db:seed` builds a realistic fixture set — every release
precision, a decimal-numbered novella, co-authored books, trashed records, a record
deleted and then restored — used by development and, later, by the browser tests.

Versioning, revision history, and deletion are deliberately one mechanism rather
than three features. Every change to a book or series bumps a version, appends a
complete snapshot, and is written in a single transaction, so history can never
disagree with the record. Deletion is simply another version, which is what makes
it reversible and keeps the whole sequence of deletions and restorations intact.
That version doubles as a concurrency check, so two people editing the same book
no longer means one silently overwrites the other. Reverting to an earlier version
never deletes the record, whatever state that version was in.

Authors are their own records rather than a list of names copied onto each book, so
a book can be linked to an author, filtered by one, and a misspelling corrected in a
single place instead of everywhere it was repeated. Authors are matched regardless
of capitalisation, and the order they are credited in is preserved. Changing who
wrote a book is an edit to that book like any other: it is versioned, appears in its
history, and can be reverted.

Books are identified by their Amazon ASIN, since that is where the books being
tracked come from. It stays optional, so a book with no Amazon page can still be
added, and two live books cannot claim the same one — though an ASIN is freed again
as soon as its book is moved to the trash. Series names are deliberately left
un-policed: a series name is a label rather than an identity, and a duplicate is
something a small group can sort out. See
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
