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

- [x] **Post activity events to a Discord channel**

  ```
  `activity` (`packages/db/src/schema/activity.ts`) is a single append-only
  table backing every kind in `ACTIVITY_KINDS`
  (`packages/domain/src/activity.ts`): `book.added`, `status.changed`,
  `rating.changed`, `shelf.removed`, and `book.released`. Today that feed only
  reaches the web app (`apps/web/src/app/features/activity/activity-page.ts`,
  whose `KIND_LABELS`/per-kind `@switch` at lines 20-25 and ~84-133 render
  each one) — nothing posts any of it to Discord. `apps/bot/src` has no
  webhook or channel-send code anywhere yet (checked `client.ts`, `main.ts`,
  `commands/upcoming.ts`) — this is greenfield on the bot side.

  `book.released` is the one kind with a system writer already:
  `apps/server/src/jobs/releases.ts`'s `runReleaseAnnouncementJob` inserts it
  idempotently (guarded by both `books.released_announced_at` and the partial
  unique index `activity_released_once_idx`) once daily, with no human actor.
  Every other kind is written inline by a member action (`status.changed`/
  `rating.changed`/`shelf.removed` from `packages/db/src/mutations/shelf.ts`,
  `book.added` from `packages/db/src/mutations/books.ts`'s `onCreated`) —
  there is no existing batch/poll path for those the way the release job
  gives `book.released`.

  Wanted: the bot (or the server, via a bot-owned webhook/channel send)
  announces new activity rows to a configured channel — not just releases.

  Open decisions: whether every kind announces or only a subset (a release or
  a new addition is probably worth a ping; every single rating change to
  every channel member is probably not — needs a per-kind or member-level
  opt-in, distinct from the existing `mine:true`-style linked-member gate);
  this needs a `guild_settings` table (announcement channel id per guild)
  that doesn't exist yet — no schema work has started; whether the writer
  posts directly (coupling `apps/server`/the mutation layer to Discord) or
  the bot polls/subscribes to new `activity` rows on some interval instead
  (keeping the coupling one-directional, bot → DB, the way every other bot
  query already works — this also means a poll needs its own "last seen
  activity id" cursor, since `activity.id` is already a `bigserial` made for
  exactly that kind of keyset read); message format (reuse
  `apps/bot/src/format/embeds.ts` or a plain announcement string per kind,
  since a full embed may be overkill for a rating change); how much this
  overlaps with the still-open `/shelf @user` and `/book <title>` bot
  commands above — a shared "resolve a Discord guild/member to app state"
  layer would serve announcements too, not just slash commands.

  Done: the writer posts directly, not the bot — `packages/api/src/discord/announcer.ts`'s
  `createDiscordAnnouncer` is a bot-token REST client the server calls
  synchronously (fire-and-forget, never throwing) right after the same two
  write sites that already produce these kinds: `POST /books`
  (`packages/api/src/routes/books.ts`) for `book.added`, and
  `apps/server/src/jobs/releases.ts`'s `runReleaseAnnouncementJob` for
  `book.released`. This sidestepped the cursor/read-only-bot-role question
  entirely, since the server already holds the full DB role.

  Only these two kinds announce — `status.changed`/`rating.changed`/
  `shelf.removed` deliberately stay web-only, per the noise concern above.
  Channel config is one env var (`DISCORD_ACTIVITY_CHANNEL_ID` in
  `serverSchema`, `packages/config/src/env.ts`), not a `guild_settings`
  table — this app is single-guild everywhere else already
  (`DISCORD_ALLOWED_GUILD_ID`), so per-guild configurability wasn't built.
  Message format is a plain `content` string, not an embed. The `/shelf
  @user` / `/book <title>` bot-command overlap noted above is still
  unaddressed — no shared "resolve Discord member ↔ app state" layer exists
  yet.
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
