# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed — Book and series descriptions keep their line breaks (2026-08-24)

Descriptions were rendered as plain `<p>` text, so HTML collapsed every
newline and multi-paragraph descriptions ran together as one block. The
book and series detail pages now preserve line breaks from the stored
text.

### Changed — Book and series URLs use readable slugs instead of UUIDs (2026-08-24)

`/books/a1b2c3d4-...` is now `/books/mistborn-the-final-empire`, and the same
for series pages. Slugs are generated once, from the title/name, and never
change afterward — even after an edit — so existing links keep working. Old
UUID-based URLs still resolve too. Member profile URLs are unchanged.

### Added — "Everyone's take" names whose status and rating each row is (2026-08-24)

The book detail page's community list showed a status chip and rating per
member with no indication of which member — every row was anonymous. Each
row now leads with the member's username.

### Fixed — Books list no longer badges books that aren't on your shelf (2026-08-24)

The books list showed a "Backlog" chip on every book with no shelf entry,
indistinguishable from a book you'd actually set to Backlog. The badge is
now omitted entirely, in both the list and grid views, when `myStatus` is
`null`.

## 0.5.0 - 2026-08-19

### Added — A URL field for books (2026-08-19)

`books` had no place for a plain link to the book's own page — `asin` is an
Amazon product code, not a URL, and `coverUrl` only ever pointed at a cover
image. Books added by hand, with no ASIN, had nowhere to point a reader who
wanted to find or buy the book. The "Add a book" / "Edit book" form now has a
"Book URL" field (`http(s)` only), and the detail page shows a "View book"
link under the release date whenever one is set.

### Added — Deselect a shelf status to remove a book from your shelf (2026-08-19)

The status picker on a book's detail page acted as a plain radio group — once
you'd set a status there was no way back to "no status" short of editing the
URL to call the remove endpoint directly. Clicking the already-active status
now deselects it, which removes the book from your shelf (status and rating
both) the same way the "Clear rating" button already worked for ratings. The
activity feed's same-day grouping now folds `status.changed` and
`shelf.removed` into the same one-row-per-day story, so working through the
picker's deselect toggle a few times in one sitting still reads as one line,
not one per click.

### Added — Paste Amazon product details to autofill the book form (2026-08-18)

Adding a book meant hand-typing title, subtitle, authors, page count, series
position, release date, and description even though most books are added
straight off an Amazon listing. Pasting a copied Amazon product listing
anywhere on the "Add a book" / "Edit book" form now auto-fills whichever of
those fields it can find — including every co-author on a multi-author
listing, splitting a `Title: Subtitle` listing title into the two separate
fields, and reading the series position and release date from the listing's
details — leaving the rest of the form for the member to fill in or correct
as usual. An ordinary paste into a single field (a title, a URL, an ASIN) is
left alone — only a paste that looks like a bulk product-page dump is
intercepted.

## 0.4.0 - 2026-08-18

### Changed — Remove the bullet glyph from status chips (2026-08-18)

Every status chip rendered the same undifferentiated `●` ahead of its label,
regardless of tone — no consumer ever set a distinct icon per status, so the
glyph added visual noise without conveying anything the label text and color
didn't already.

### Changed — Default book list sort to release date, descending (2026-08-18)

The books page and `GET /books` both defaulted to title, ascending. Newest
releases first is a more useful default for a page whose whole point is
tracking what's coming out; picking "Release date" from the sort menu now
also lands on newest-first instead of oldest-first.

## 0.3.0 - 2026-08-18

### Added — App icon and PWA manifest (2026-08-18)

The app previously shipped with Angular's default favicon. It now has a
proper icon — a stack of three book covers in the app's purple/blue/indigo
palette — as a favicon (`.ico`, 16px and 32px PNG), an Apple touch icon, and
Android/PWA icons (192px, 512px) declared through a new `manifest.webmanifest`.
The toolbar's "Books" text brand link is now this same icon.

### Fixed — Sessions silently died 15 minutes after login (2026-08-18)

The server has always supported a 30-day refresh token with rotation, but the
Angular app never called `POST /auth/refresh` — so once the 15-minute access
token expired, every API call started failing with 401 and the app behaved as
if the member had been logged out, even though their session was still valid
server-side. A new `authInterceptor` now catches a 401, refreshes silently
(coalescing concurrent 401s into one refresh call so simultaneous requests
don't each rotate the token and trip reuse-detection), and retries the
original request; only a genuinely dead refresh token now sends someone back
to `/login`.

## 0.2.3 - 2026-08-18

### Fixed — `/upcoming` unregistered in production (2026-08-18)

Slash-command registration (`deploy-commands.ts`) was a script meant to be
run by hand after every deploy, but nothing in the Docker Compose deployment
ever invoked it and it wasn't even bundled into the `bot` image — so
production's Discord application had zero registered commands. It's now
built into the image alongside `main.js`, runnable as a one-shot
`docker compose run --rm bot node dist/bot/deploy-commands.js` with the
container's own env, no local `node_modules` or copied secrets required.

## 0.2.2 - 2026-08-18

### Fixed — Cover art blocked by the Content-Security-Policy (2026-08-18)

`coverUrl` is a member-supplied link to wherever they found the cover — Amazon,
Royal Road, Goodreads, anywhere — not something this app hosts itself.
Helmet's default `img-src 'self' data:` only ever allowed a same-origin or
inline image, so every real cover silently failed to load. `img-src` now also
allows `https:`, matching how `style-src` and `font-src` already trust it.

## 0.2.1 - 2026-08-18

### Fixed — Server container's published port bound to all interfaces (2026-08-18)

Docker Compose published the server's port as `${SERVER_PORT:-4000}:4000`,
which binds to every interface on the host, not just loopback. Behind a
reverse proxy that means the app is also reachable directly, bypassing TLS
and nginx entirely. It's now bound to `127.0.0.1` explicitly, matching how
this app is actually deployed. `postgres`, `server`, and `bot` also gained
`restart: unless-stopped`, so a crash or host reboot doesn't require someone
to notice and run `docker compose up` by hand; `migrate` stays one-shot.

## 0.2.0 - 2026-08-17

### Added — Badge each book on the books page with the viewer's own status (2026-08-17)

Both the list and grid views now show a small "plan"/"backlog"/"reading"/
"completed"/"dropped" chip on a book the viewer has on their shelf, and
show nothing for a book they haven't touched.

`GET /books` gained a `myStatus` field per item, resolved for the
requesting member alone — deliberately not added to the shared
`BookSummary` (which every other list endpoint — releases, a series'
books, someone else's shelf — also returns): "my status" only means
something for one viewer on this one endpoint. It lives on a new
`BookListItem` type instead, and is batch-resolved in the same query as
the existing author/series lookups rather than once per row.

### Fixed — Redundant "plan" badge on the releases page (2026-08-17)

A dated release row showed a "plan" chip next to the plan toggle when
planned, on top of the toggle's own "✓ Planned" label — the same state said
twice. Removed the chip.

### Changed — Shrink the calendar's plan button to an icon (2026-08-17)

A day cell is narrow and can hold several releases, where the "+ Plan" /
"✓ Planned" text button crowded the titles. The calendar now uses a 24px
plus/check icon instead; the releases page keeps the text button. It is
still a real button carrying its name and pressed state in ARIA, so what a
screen reader announces has not changed.

Material centres a 48px touch target on an icon button regardless of its
visible size, which at 24px spilled out of the cell and overlapped the
target of the release stacked beneath it — a tap near the boundary could
have planned the wrong book. The target is now sized to the button, still
meeting the 24px WCAG minimum.

### Changed — Cover art on the releases page (2026-08-17)

Every release row now leads with the book's cover, matching the books
page, and each row's cover and text are a single link to the book. The TBA
and Undated sections, which previously showed a bare title, now name the
series as well.

The page had been fetching the first 100 series into a lookup map purely to
name a release's series; it reads `seriesName` off the release itself now,
so that second request is gone along with its silent 100-series ceiling.

### Added — List and grid views on the books page (2026-08-17)

The books page now offers two layouts behind a toggle, remembered across
visits: a dense list of one book per row in aligned columns — cover
thumbnail, title, series, authors, release date — and a grid of cover-led
tiles. Cover art was already stored for every book but had only ever
surfaced on the book's own page.

`BookSummary` gained a `seriesName` field to make this possible. It carried
`seriesId` but no name, so nothing listing books could name a series
without a second request per page. A book's own page now names its series
too, in place of the placeholder "Part of a series" link.

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
