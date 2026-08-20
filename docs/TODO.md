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

- [ ] **Support selecting multiple statuses on the books status filter (OR'd)**

  ```
  The books page's status filter is single-select end to end: `AppSelect`
  (`apps/web/src/app/shared/ui/select.ts`) wraps a non-`multiple`
  `MatButtonToggleGroup`, whose `value` model is `string | null`
  (`select.ts:46`) — picking a new status replaces the old one rather than
  adding to it. `BooksListPage` (`books-list-page.ts:96-101`) binds that
  straight to `store.filters().status`, a single `string` on
  `BookListFilters` (`books-list-page.ts:28`). Server-side, `status` is a
  single `z.enum(BOOK_STATUSES).optional()` on `BookListQuerySchema`
  (`packages/domain/src/book.ts:67`), and `booksWithStatus(status: string)`
  (`packages/db/src/queries/books.ts:120-124`) builds an `= ${status}` subquery
  — there is no array-valued query param anywhere else in the app to follow
  as precedent (checked `ListQuerySchema`/`booleanQueryParam` in
  `packages/domain/src/list.ts`).

  Wanted: the status filter accepts multiple statuses at once and matches
  books in ANY of them (e.g. "reading" OR "backlog"), not just one.

  Open decisions: `AppSelect` needs a multi-select mode (or a second
  component) since today's click-to-toggle-single behavior
  (`onToggleChange`, `select.ts:48-50`) is deliberately single-select with
  click-to-deselect — turning `MatButtonToggleGroup`'s `multiple` on changes
  that semantics; wire format for the multi-value query param (repeated
  `status=reading&status=backlog` vs. one comma-separated `status` value —
  `createListStore`'s `params` computed, `list-store.ts:56-63`, currently
  assumes one scalar per filter key and would need to handle an array
  value); `booksWithStatus` becomes an `IN (...)` rather than `= ...`; whether
  `ratedBy`/`author`-style single-value filters elsewhere should get the same
  treatment or this stays status-only.
  ```

- [ ] **Add a personal note and percentage-read to shelf entries**

  ```
  `book_user_status` (`packages/db/src/schema/shelf.ts`) is the one row per
  `(user, book)` that already carries `status`, `rating`, `startedAt`, and
  `finishedAt` — but nothing free-text and nothing progress-shaped. The wire
  mirror is `UserBookStatus`/`ShelfUpdateSchema` in `packages/domain/src/shelf.ts`,
  and both the read (`GET /books/:id/me`) and write (`PATCH /books/:id/me`)
  sides go through `getShelfStatus`/`upsertShelfStatus`
  (`packages/db/src/mutations/shelf.ts`), which already does the upsert +
  `status.changed`/`rating.changed` activity-row pattern a new field would
  follow. On the web side, `BookDetailPage`
  (`apps/web/src/app/features/books/book-detail-page.ts`) renders `StatusPicker`
  and `RatingWidget` for `myStatus()`/`myRating()` with the same
  debounce-then-PATCH flow (`statusChanges`/`ratingChanges` subjects,
  `book-detail-page.ts:338-358`) — a note field and a progress control would
  slot in next to those, not replace them.

  Wanted: a per-shelf-entry free-text note (private to the member, not shown
  in the "everyone's take" community panel) and a percentage-read value to
  track progress while `status = 'reading'`.

  Open decisions: whether percentage is stored directly (a plain 0-100 column)
  or derived from a stored current-page against `books.pageCount`
  (`packages/db/src/schema/books.ts:45`, already nullable — so a derived
  approach needs a fallback for books with no page count); whether progress
  changes get their own activity kind the way status/rating do, or are too
  noisy for the feed; note length limit and whether it's markdown or plain
  text; whether percentage/note surface anywhere in `listUserShelf`
  (`packages/db/src/queries/users.ts:174`) and the profile shelf view, or stay
  book-detail-only.
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

- [x] **Support pasting Amazon product details to fill out book fields**

  ```
  `BookFormPage` (`apps/web/src/app/features/books/book-form-page.ts`) is
  entirely hand-typed today: title, subtitle, authors (`AuthorsInput`),
  series, series position, release date/precision, page count, ASIN, cover
  URL, and description are ten separate fields with no bulk-fill path. The
  catalog is Amazon-sourced by convention (`docs/data-model.md`'s "A book is
  identified by its ASIN" section, `books.ts:46`'s "The catalog is
  Amazon-sourced" comment), but that's just a naming/format decision for the
  `asin` column — nothing in the codebase fetches or parses Amazon data.
  There is no scraping, import, or autofill code anywhere in the repo today
  (checked; the only "Amazon" references are the ASIN column/docs above).

  Wanted: a way to paste something Amazon-sourced — either raw copied text
  from a product page, or an Amazon product URL — into `BookFormPage` and
  have it fill in as many of the existing fields as it can parse (title,
  authors, description, page count, ASIN, cover URL at minimum), leaving the
  member to review and correct before submit rather than retyping everything.

  Open decisions: paste-text parsing (regex/heuristics over whatever a member
  copies out of the page — fragile but needs no network access from the
  server) vs. URL-based fetch-and-parse (needs the server or a job to fetch
  the Amazon page, which is heavier and more fragile against markup changes
  and potential blocking); where parsing runs (client-side on paste vs. a new
  API endpoint); how confidently-wrong parses are surfaced (e.g. a diff-style
  preview the member confirms field-by-field, rather than silently
  overwriting `model`); this only ever seeds the form model — it still goes
  through the normal create/update path (`BooksApi`, `books.ts`
  `BookCreateSchema`/`BookUpdateSchema`) untouched.

  Done: client-side paste-text parsing, no server fetch. A new pure module,
  `apps/web/src/app/features/books/amazon-paste-parser.ts`, extracts title
  (splitting off a subtitle at the first `:`, since Amazon's own listing
  titles are frequently `Title: Subtitle`), authors (each author carries its
  own `(Author)` tag on the byline — "Name1 (Author), Name2 (Author)" — rather
  than one shared tag for the whole comma list, so every tagged name is pulled
  out individually, not just the first), page count, series position (just the
  plain `seriesPosition` text field, parsed from "Book 1 of 2" — independent
  of `seriesId`, which stays out of scope, see below), release date (from the
  "Publication date" / "May 14, 2024" label-value pair in the product-details
  block, always resolving to `releasePrecision: 'day'` since that pair is only
  ever a full date — never partially matched, and never set without its
  precision, since the DB requires the two to agree), and description from
  whatever plain text a member pastes — a real "select all and copy" of an
  Amazon listing carries no HTML markup and no visible ASIN/cover image at
  all, so those two fields are left unmatched by design rather than guessed;
  `text/html` clipboard data is used only as a bonus source for
  `asin`/`coverUrl` when present. `BookFormPage`'s `<form>` gained a
  page-level `(paste)` listener (`onPaste`) gated by
  `looksLikeAmazonProductPaste` (a length + signal-count heuristic) so an
  ordinary paste into a single field is never hijacked. Matched fields are
  applied straight onto `model` via `{ ...m, ...fields }` — result keys are
  only ever present when found, so nothing already typed is clobbered — with
  a `Flash` message reporting how many fields were filled, standing in for a
  diff-preview UI. `seriesId` was left out of scope: resolving a parsed
  series name to a UUID would need a full series list this page doesn't
  load, and a wrong silent match risks corrupting data worse than leaving
  the field blank.
  ```

- [x] **Add a URL field for books**

  ```
  `books` (`packages/db/src/schema/books.ts`) has two URL-shaped columns
  today — `asin` (an Amazon product code, not a URL, validated to exactly
  10 characters by `books_asin_format`) and `coverUrl` (cover *image* src
  only, rendered via `app-book-cover` — `book-detail-page.ts:62`). Neither is
  a link to the book's own page: there's no free-form "buy it here" /
  "source page" URL a hand-added book (one with no ASIN, per the schema's own
  "so a book with no Amazon page can still be added by hand" comment) could
  carry. `BookCreateSchema`/`BookUpdateSchema` (`packages/domain/src/book.ts`)
  mirror the same two fields, and `book-form-page.ts` (`asin`/`coverUrl`
  inputs at lines 199-208) has no third field for it.

  Wanted: a nullable `url` column on `books`, exposed on create/update/detail,
  with an input on `BookFormPage` and a link rendered on `BookDetailPage`
  (near the cover, e.g. "View book" alongside the existing ASIN-derived
  Amazon link if one exists, or replacing the need for one on hand-added
  books).

  Open decisions: field name (`url` vs. something more specific like
  `sourceUrl`, given `coverUrl` already claims the generic name); validation
  (well-formed URL only, or also scheme-restricted to `http(s)`); whether
  this supersedes `asin` for books added by hand or coexists with it
  permanently.

  Done: a nullable `url` text column on `books` (migration
  `0001_add_book_url.sql`), scheme-restricted to `http(s)` by a
  `books_url_scheme` CHECK constraint — same pattern as `books_asin_format`.
  Named `url` per the first open decision above. Validated at the domain
  layer too (`httpUrlSchema` in `packages/domain/src/book.ts`, a
  `z.string().url()` refined to require an `http(s)` scheme), on
  `BookCreateSchema`/`BookUpdateSchema`. Modeled like `description`/
  `pageCount` rather than `asin`/`coverUrl`: it lives on `BookDetail` only,
  not `BookSummary`/`BookListItem`, since nothing on a list view needed it.
  `BookFormPage` gained a "Book URL" input next to Cover URL, with the same
  `''`-in-the-model / `null`-over-the-wire boundary and an inline pattern
  validator; `BookDetailPage` renders a "View book ↗" link under the release
  date when `book.url` is set — there was no existing ASIN-derived link to
  place it alongside, so it stands alone. Coexists with `asin` permanently
  (third open decision): `asin` still drives dedup and the live-uniqueness
  constraint, which `url` has no reason to take over.
  ```

- [ ] **Book descriptions should keep line breaks**

  ```
  `books.description` (`packages/db/src/schema/books.ts:24`) is a plain `text`
  column with no storage-side normalization, so whatever line breaks the
  source data has (Google Books/Open Library descriptions are often
  multi-paragraph) are preserved in the database. `BookDetailPage` renders it
  as `<p class="description">{{ book.description }}</p>`
  (`apps/web/src/app/features/books/book-detail-page.ts:83-84`), and
  `.description` (`book-detail-page.ts:204-206`) sets no `white-space`, so it
  stays at CSS's default `normal` — every `\n` collapses and multi-paragraph
  descriptions render as one run-on block.

  Wanted: paragraph breaks in a book's description are visually preserved on
  the detail page.

  Open decisions: CSS-only fix (`white-space: pre-line` on `.description`,
  no template/schema change) vs. splitting on blank lines and rendering
  actual `<p>` tags per paragraph; `series.description` renders through the
  identical pattern (`apps/web/src/app/features/series/series-detail-page.ts:26-27,99`)
  and has the same bug — worth fixing alongside rather than leaving it
  inconsistent.
  ```
