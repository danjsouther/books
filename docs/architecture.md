# Architecture

Decisions that shaped this codebase, and why. Written so a future reader can
tell a deliberate choice from an accident.

## The web app is a single-page app, not server-rendered

Every route in this app requires a Discord login — there is no public catalog,
no shareable book page for strangers, nothing to index. Server rendering exists
to make a first paint useful before JavaScript arrives, which for an entirely
private app means rendering per-user HTML and then taking great care that it is
never cached or served to the wrong person.

The scaffold this repo started from had SSR wired up. It was removed
deliberately (`src/server.ts`, `src/main.server.ts`, `app.config.server.ts`, and
`app.routes.server.ts` are all gone, along with `@angular/ssr` and
`@angular/platform-server`). What that bought:

- No per-user HTML, so no `Vary: Cookie` / `Cache-Control: private` discipline
  to get right, and no way to leak one member's shelf to another through a
  caching proxy.
- No hydration, no transfer state, no logged-out flash on boot.
- No `security.allowedHosts` configuration, which returns a bare `400` for
  unrecognised `Host` headers and is a confusing first-deploy failure behind a
  reverse proxy.
- The browser bundle is the _only_ build, which means the planned Electron
  client loads the same artifact the web app does. The desktop path cannot
  bit-rot because there is no second build to forget about.

The cost is a blank first paint until the app boots and resolves the current
user. That is acceptable for a private tool used by a handful of people, but it
is the reason `index.html` should carry a real app-shell skeleton rather than
nothing.

Express still has a job — it will host `/api/v1` and serve this bundle — but it
renders no HTML.

## One npm package, with boundaries drawn by path aliases

The repo holds a browser app, a Node API, and shared code, but it is a single npm
package with a single `node_modules`. Not workspaces: nothing here is published,
everything deploys together, and npm workspaces plus the Angular CLI plus Docker
layer caching is three sources of friction bought for no benefit at this scale.

Internal boundaries are TypeScript path aliases instead, and **they point at
source files rather than a `dist`** (`"@books/domain":
["./packages/domain/src/index.ts"]`). There is therefore no build step between
internal packages — the Angular builder, esbuild, and Vitest each compile the
TypeScript directly, and editing `packages/domain` is picked up by a running dev
server the same way editing a component is.

The important boundary is that **browser code may import `@books/domain` and
nothing else**. `packages/api` — and, later, `packages/db` — are server-only, and
`domain` must stay free of Node built-ins and of `drizzle-orm`, not even
importing it for a type. That is enforced structurally rather than socially:
`apps/web/tsconfig.app.json` redefines `paths` with only the `domain` entry, so a
stray `@books/api` import in a component fails to compile with "cannot find
module". The narrowing is deliberate duplication and the comment there says so.

## The API is a library, and the server is its host

`packages/api` exports `createApiRouter(deps)` and knows nothing about ports,
static files, or process lifecycle; `apps/server` mounts it. Two things follow.
Integration tests can mount the router under `supertest` with test doubles and no
server process. And splitting the API away from static hosting later — the entry
in `docs/TODO.md` — is a change to the host, not to the API.

Everything the router needs is passed in rather than imported, which is what
keeps that true as dependencies accumulate.

## Cache headers on the bundle are part of the deploy, not a detail

`apps/server/src/static.ts` serves hashed assets `max-age=1y, immutable` and
`index.html` `no-store`. Getting that backwards is the classic single-page-app
deploy failure: a cached `index.html` keeps pointing at bundle hashes the new
deploy has already purged, and every returning client gets a blank page until
they clear their cache. Files copied verbatim from `public/` are not hashed and
so get a modest hour instead.

The same file falls back to `index.html` for any non-`/api` GET, so a deep link
survives a hard refresh. Unmatched `/api/` paths deliberately fall through to a
404 rather than the fallback — a `fetch` that expected JSON and received the app
shell fails somewhere far from the actual mistake.

## Strictness is on from the start

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and Angular's
`strictTemplates` and `typeCheckHostBindings`.

`noUncheckedIndexedAccess` in particular is chosen with the calendar in mind:
grid code indexes weeks and days constantly, and having `grid[row][col]` typed
as possibly-undefined is exactly the friction that prevents an off-by-one from
reaching the page. `exactOptionalPropertyTypes` matters for the API layer, where
"field absent" and "field explicitly null" mean different things — clearing a
rating versus leaving it alone.

These are all far cheaper to enable now, at a few hundred lines, than later.

## Lint encodes the project's conventions

`.claude/CLAUDE.md` lists Angular conventions this project follows. Where
angular-eslint has a rule for one, `eslint.config.js` turns it on rather than
leaving it to review: `prefer-standalone`, `prefer-signals`, `prefer-inject`,
`prefer-service-decorator`, `prefer-host-metadata-property` (which is what bans
`@HostBinding`/`@HostListener`), and `prefer-class-binding` (which bans
`ngClass`/`ngStyle`).

Two conventions have no upstream rule and are enforced by hand:

- `no-restricted-syntax` rejects `standalone` and `changeDetection` properties in
  component decorators, both of which are defaults in v22+ and should not be
  restated.
- `no-restricted-imports` blocks `NgClass`/`NgStyle` from `@angular/common`.
  Standalone components must import a directive to use it, so blocking the
  import is an effective ban.

`@angular-eslint/template/accessibility` is on, and is not optional: this project
requires passing axe and WCAG AA, and static template checks catch a meaningful
slice of that at zero runtime cost.

Deliberately **not** enabled: `prefer-on-push-component-change-detection`. OnPush
is the default in v22+ and setting it explicitly is noise.

## Tailwind is loaded as CSS, not SCSS

`src/tailwind.css` holds `@import 'tailwindcss'` and the `@theme` token block;
`src/styles.scss` holds the handful of rules that cannot be utilities. Both are
listed in `angular.json` `styles`.

Tailwind v4's supported path is CSS-first, and routing it through SCSS is the
less-travelled option. Keeping the Tailwind entry as a `.css` file sidesteps the
question entirely while leaving SCSS available for component styles.

## Authentication: one token scheme, two transports

There is no session store. The cookie value _is_ the bearer token — `books_at`
holds the same JWT a desktop client would carry in an `Authorization` header —
which is what makes the web app "a thin wrapper over the same tokens" literal
rather than aspirational. `packages/api/src/middleware/auth-context.ts` checks
`Authorization: Bearer` first and falls back to the cookie, recording which one
it used as `req.authMethod` — that field is what the CSRF layer branches on.

**Access tokens are short-lived JWTs (15 minutes, HS256, via `jose`) and are
never revoked**, deliberately: they are stateless by design, and a revocation
list would reintroduce the session-store problem this scheme exists to avoid.
Fifteen minutes bounds how long a stolen one is useful. **Refresh tokens are the
opposite in every respect** — opaque 32-byte random values, never JWTs, stored
only as a SHA-256 hash (already high-entropy, so a slow KDF would add latency
for no benefit — the standard exception to "always bcrypt"), and they **rotate
on every use**: presenting one revokes it and issues a new one in the same
`family_id`. Presenting a token that is _already_ revoked means the chain has
been stolen, not merely reused by accident, so the entire family is revoked at
once rather than trusting that one presentation.

**Discord's own tokens are discarded** the moment the two calls that need them
(`/users/@me`, `/users/@me/guilds`) return. The app never acts on a member's
behalf again, so holding onto them would be pure liability with no matching
benefit.

**PKCE (S256) runs on every login, including web,** even though the exchange
itself happens server-side with a confidential client secret and would be safe
without it. One code path is simpler than a web-only and a desktop-only one,
and it means the desktop flow — which has nowhere to safely hold a client
secret — needs no special case later.

### CSRF is three independent layers, not one

1. `SameSite=Lax` on `books_at` blocks cross-site POST, but still permits a
   top-level cross-site _GET_ to carry the cookie — hence the standing rule that
   **no GET route may ever mutate**.
2. Double-submit: `XSRF-TOKEN` is a non-`httpOnly` cookie the client echoes back
   as an `X-XSRF-TOKEN` header, compared to the cookie value with
   `timingSafeEqual`. A cross-site attacker's page can make the browser _send_
   the cookie automatically but cannot _read_ it to forge the header. Enforced
   **only when `req.authMethod === 'cookie'`** — a bearer request carries no
   ambient credential a page could exploit in the first place. Getting that
   branch backwards is the actual failure mode, so it has a dedicated unit test
   (`middleware/csrf.spec.ts`) rather than relying on the integration suite to
   happen to exercise it.
3. `Origin`/`Referer` must match `PUBLIC_BASE_URL` on any mutation, when the
   browser sent one. Its absence is not itself treated as suspicious — a
   non-browser client (the bot, later a service token) does not send these
   headers at all, and a request with neither should not be penalised for being
   honest about what it is.

`books_rt` sidesteps the double-submit question for `/auth/refresh` entirely: it
is `SameSite=Strict` and scoped to `Path=/api/v1/auth`, so it is never attached
to a cross-site request in the first place, regardless of method.

### The membership gate is a Discord API call, not a database flag

`DISCORD_ALLOWED_GUILD_ID` is checked against `GET /users/@me/guilds` on every
login. There is no separate "invited" flag in this app's own database — leaving
the Discord guild _is_ leaving the app, which is exactly the semantics a
Discord-native friend-group tool should have.

### What Phase 3 deferred

The Electron desktop client does not exist yet (tracked in `docs/TODO.md`), so
`/auth/discord/callback` for `client=desktop` returns the token pair directly as
JSON rather than through a loopback or custom-protocol redirect — there is
nowhere real to redirect to. The `client` column and the branch are real and
tested; only the handoff mechanism is provisional.

## The API surface: one list contract, Zod schemas living in `@books/domain`

Every collection endpoint — books, series, a series' books, trash, changes, users, a
user's shelf — shares one envelope (`ListResponse<T>`) and one pagination scheme
(`page`/`pageSize`, capped at 100, every `ORDER BY` ending in an `id` tiebreaker so a
sort with ties still pages stably). `/activity` is the deliberate exception: it is
keyset-paginated on `id`, not offset, because it is the one endpoint written to
continuously — offset pagination is exactly where a feed with rows arriving mid-page
duplicates or drops items. See `docs/api.md` for the full surface.

Request-body and query-string validation runs through Zod schemas defined in
`@books/domain`, not `@books/api`. The reason is Phase 5, not this phase: Angular's
`httpResource` accepts a `parse` option, and a schema that already lives in the
isomorphic package is exactly what that option wants — the same `BookCreateSchema`
that rejects a bad `POST /books` body on the server can validate what the form sends
before it ever leaves the browser. `@books/api` route handlers call `Schema.parse()`
directly inside their async handler with no `try/catch`; a thrown `ZodError`
propagates to `.catch(next)` and `error-handler.ts` already maps it to a clean `400
validation_failed` with `details: issues`.

One Zod trap worth recording: an update schema is **not** `CreateSchema.partial()`.
Every create-schema field carries a `.default(...)` for the create path, and Zod
applies that default whenever the key is absent from the input — `.partial()` only
makes the key optional, it does not suppress the default underneath. A `PATCH` that
sends `{title}` and nothing else would, with `.partial()`, silently reset every other
field — `authors` included — back to its create-time default instead of leaving it
alone, which is the opposite of what a patch means. `BookUpdateSchema` and
`SeriesUpdateSchema` are therefore written out explicitly, every field `.optional()`
with no default, so "absent" means "unchanged."

Query builders that correlate an outer table's column inside a nested subquery carry
a similar trap: `sql\`${outerTable.id}\``renders as a bare, unqualified`"id"`, which
resolves against whichever table is innermost in scope — silently wrong (or, worse,
silently *not erroring*) whenever the inner table happens to have its own `id`column.`queries/series.ts`'s `bookCount`/`nextRelease`and`queries/users.ts`'s
`bookCount`/`avgRating` qualify the outer reference explicitly
(`sql.raw('"series"."id"')`) rather than relying on accidental scope resolution.

## Signal Forms and `@angular/aria`: the first real usage, and what it cost

Phase 6 is the first place either `@angular/forms/signals` or `@angular/aria` gets
used anywhere in this codebase. Both are genuinely untested territory for this
project, and both had gaps between their own documentation and their actual
runtime behavior — found by writing the tests, not by reading the types.

**`focusMode="activedescendant"` is required on `ngListbox` inside a combobox
popup, and the package's own example doesn't set it.** `Listbox` defaults to
`focusMode="roving"`, which moves real DOM focus onto whichever option is
highlighted — impossible inside a combobox, where focus has to stay on the text
input for typing to keep working. Without the explicit override, `app-combobox`
(`shared/ui/combobox.ts`) still _looked_ fully functional: the popup opened,
options highlighted visually via `data-active`, a click still selected an
option. What silently didn't work was `aria-activedescendant` on the combobox's
own input — the one attribute a screen reader actually needs to announce which
option is highlighted while typing. `combobox.spec.ts` is what caught it, by
asserting on the rendered attribute rather than trusting the visual behavior.

**`[formField]` on a plain native `<input>`/`<textarea>` requires a non-nullable
`string`.** Binding it to a `WritableSignal<string | null>` field is a compile
error, not a runtime surprise — but it meant `BookFormModel`/`SeriesFormModel`
use `''` for "not set" on every plain-text field, converting to `null` once, at
the API boundary (`toApiInput()`), rather than carrying `string | null` through
the form the way the domain schema does. `<input type="date">` and components
implementing `FormValueControl` (the combobox, `AuthorsInput`) are the
exceptions — both accept `null` directly, which is why `releaseDate` and
`seriesId` keep their nullable domain type in the form model.

**`pattern()`/`required()`/`minLength()`/`maxLength()` don't accept a nullable
field either** — only `min`/`max`/`minDate`/`maxDate` are typed for `| null`.
The ASIN format check is a hand-written `validate()` instead of `pattern()` for
exactly this reason.

**`npm run typecheck` (`tsc -b`) does not catch Angular template errors** —
an unknown `[formField]` binding (from a forgotten import), a type mismatch
between a field and the control it's bound to, both compile cleanly under
`tsc -b` and only fail under `ng build`/`ng test`, which run the real Angular
compiler's template type-checking pass. Every page in this phase was verified
against `ng build`, not just `npm run typecheck`, for exactly this reason —
`npm run typecheck` is necessary but not sufficient for anything touching a
component template.

### What Phase 6 deferred

The master plan calls for a live, async duplicate-ASIN check
(`validateAsync`/`validateHttp`) while typing. There is no endpoint that does an
exact-ASIN, live-row-only lookup — `GET /books?q=` searches titles — and adding
one would be new API surface in a phase scoped to the web UI. A duplicate ASIN
is instead caught by the same `409`-conflict flow the concurrency UX already
needs (`createBook`'s `findLiveDuplicate` already 409s on a live clash): the
difference between a live warning while typing and a clear error immediately on
submit is small for a few-member private app.

`createListStore`'s query-param URL sync (surviving a reload, being shareable)
is still deferred — Phase 6 built and used the filter UI Phase 5 had no
consumer for yet, but URL sync itself remains a gap for whichever page next
needs a link to a specific filtered view.

"Last edited by X" on the book/series detail page was dropped: `GET
/books/:id` carries a version number but not the editor's identity, and
resolving `changedBy` (a uuid on the revision, not the book) to a username would
mean a second request for a single line of text. "Version N · History" stands
in its place.

## The calendar: what Grid needed, and what it didn't

Phase 7 is the first real use of `@angular/aria`'s `Grid`. Unlike `Listbox`
inside a combobox (Phase 6), `Grid` needed no manual `activeDescendant` wiring
at all — `Grid.activeDescendant` is a `Signal<string | undefined>` the
directive computes and maintains itself, confirmed by reading
`node_modules/@angular/aria/types/grid.d.ts` directly before writing any code
rather than assuming it worked the same way `Listbox` does.

**One `ngGridCellWidget` per cell, not one per interactive element.**
`GridCell` holds its widget as a single private reference
(`_widget`/`_getWidget()`), so a day with two releases wraps both title links
and both Plan buttons in one `<div ngGridCellWidget widgetType="complex">`,
never one widget per link. Get this wrong and only the first release's
controls would ever receive the grid's "enter the cell" keyboard handling —
the rest would render but be keyboard-unreachable.

**The real bug this phase caught wasn't in `@angular/aria` at all.** The
effect that refocuses a day cell and announces the release count after a
month change was originally written to track `store.releases()` alongside
`year()`/`month()`, on the theory that the live-region text needed the
release count as a dependency. It does — but tracking it turned every
async resolution of the releases request into something indistinguishable
from a real month change, so focus got stolen from wherever the user actually
was the moment the network response landed, including on the very first page
load. `calendar-page.spec.ts`'s "does not steal focus on the initial render"
test caught it immediately; the fix reads `store.releases()` through
`untracked()` so only `year()`/`month()` actually decide whether a navigation
happened, and the release count for the announcement is read without becoming
a trigger for it.

**Knowing whether a release is already planned needed a second request, not
new API surface.** `BookSummary`/`ReleasesResponse` carry no per-viewer status
— nothing in a `/releases` response says whether the viewer has marked a given
book `plan`, which the Plan toggle's `aria-pressed` state needs regardless of
whatever the visible "only my planned" filter is set to. `listReleases`
already supports `mine=true`, filtering to exactly the books the viewer has
marked `plan` — so `ReleaseStore` (`core/release-store.ts`) makes a second,
unconditionally-`mine:true` request over the identical window, independent of
the user-facing `mineOnly` filter, rather than adding a field to the response
shape. Same call as the Phase 6 duplicate-ASIN deferral: reuse an existing
filter over new API surface when the existing one already answers the
question.

**`new Date()` appears in two places, deliberately, and both are the
"real now" case rather than the ISO-string-parsing footgun.** The
`/calendar` → `/calendar/:year/:month` redirect and each page's "what's
today" calculation both read the actual system clock once, to answer "what
month is it right now for this viewer" — genuinely different from
`new Date('2027-03-05')`, which parses a _known_ ISO string as UTC midnight
and silently misreports the date in any timezone west of Greenwich. Both
call sites use local getters (`getFullYear()`/`getMonth()`/`getDate()`), not
`toISOString()`, specifically because `toISOString()` is UTC and would
misreport "today" in the evening for exactly the same class of viewer.

**The release list doesn't use `app-list-toolbar`.** `ReleaseListQuery` has no
`q` (text search) or `sort` field — releases aren't searched by keyword, and
the response is already grouped by precision — so the shared toolbar's
unconditional search input doesn't fit. `ReleasesPage` builds its own small
filter row (a series combobox + a checkbox) instead of forcing the shared
component to fit a resource it wasn't designed for.

## The feeds and the release job: nothing new in the API, three real bugs in the UI

Phase 8 is the first phase since Phase 5 that changes nothing in
`packages/api`/`packages/db`/`packages/domain` — `GET /activity` and
`GET /changes` were already complete, tested, and correct. All of the work,
and all three bugs this section documents, were in `apps/web` and
`apps/server`.

**`ActivityItem.payload` for `book.added` is `{}`, and `ChangeItem` has no
"reverted to vN" field.** Both were confirmed by reading
`packages/db/src/mutations/books.ts` and `packages/domain/src/change.ts`
directly before writing any UI copy, rather than assuming the master plan's
illustrative sentences ("added _Leviathan Wakes_ to _The Expanse_", "reverted
_Leviathan Wakes_ to v2 → v7") matched the actual response shape. They don't:
`book.added` carries no series reference, and a revert's `ChangeItem` carries
only the new version it created, not the version it reverted from. The
Activity and Changes rows render the simpler, honest sentence instead of
adding a field to a response shape other things already depend on.

**The release job's backdating guard compared instants, not dates, and
caught its own bug on the first real test run.** The first version of
`runReleaseAnnouncementJob`'s guard was
`createdAt <= releaseDate::timestamptz + interval '1 day'` — which looks like
a one-day grace window but isn't one: `releaseDate + 1 day` lands on a
midnight, so a book released yesterday and inserted this afternoon has a
`createdAt` _later than_ that midnight and gets wrongly treated as a
backdated historical import. The fix casts both sides to a date before
comparing (`createdAt::date <= releaseDate::date + 1`), which is what "one
day of grace regardless of time-of-day" actually requires. Caught by
`releases.spec.ts`'s very first assertion failing against a real Postgres,
not by inspection — the kind of off-by-one that looks obviously correct
until it's run against real timestamps.

**`AppSelect` silently self-selected its first option on mount.**
`@angular/aria`'s `Listbox` defaults to `selectionMode="follow"` — the
focused item is automatically selected — and establishes an initial active
item (the first one, via roving tabindex) whether or not anyone has
interacted with the widget yet. `AppSelect` (built in Phase 6, reused by
`books-list-page.ts`'s status filter ever since) never overrode this, so
every `AppSelect` in the app has been reporting its first option selected
immediately after render. Phase 6/7 never caught it because
`createListStore`'s 250ms filter debounce happens to swallow a spurious
selection that arrives synchronously on mount before any real user action.
`ActivityPage` has no such debounce — it fetches immediately on any filter
signal change — so the bug surfaced immediately as a second, unwanted
`kind=book.added` request straight after the real initial request. Fixed
with `selectionMode="explicit"` on `AppSelect`'s underlying `ngListbox`,
with a regression spec (`select.spec.ts`, previously nonexistent) asserting
no option reports selected on mount. Filed as a shared-component fix rather
than working around it per-consumer, since every existing `AppSelect` filter
in the app had the identical latent bug, only invisible where a debounce
happened to hide it.

**Why `ActivityPage` and `ChangesPage` are built differently.**
`GET /activity` is keyset-paginated (`before`/`nextCursor` on a `bigserial`
id) because the feed is written to continuously; `GET /changes` is
offset-paginated because it isn't. `ChangesPage` reuses `createListStore` and
the existing `Pagination` component outright — a genuine fit, not a stretch.
`ActivityPage` cannot: accumulating a growing list across "Load more" clicks
while resetting to empty on a filter change is fundamentally imperative, and
forcing `httpResource` plus an `effect()` to do that accumulation is exactly
the class of bug the calendar's focus-stealing effect (Phase 7) already
demonstrated is easy to get wrong. `ActivityPage` uses plain `HttpClient`
calls instead. Neither page uses `app-list-toolbar`: neither
`ActivityListQuery` nor `ChangeListQuery` has a `q` (free-text search) field,
so the toolbar's unconditional search box doesn't fit either resource — the
same call `ReleasesPage` already made in Phase 7.

**The noise-collapsing rule lives in one pure function, not a `computed()`
inline in the component.** `collapse-changes.ts`'s `collapseChanges()` takes
`ChangeItem[]` and returns collapsed rows with no Angular import at all,
so the rule — same actor, same entity, `edited`, within one hour,
_consecutive_ (not "anywhere on the page within an hour of each other") — is
directly unit-tested without a `TestBed`. The component wraps it in exactly
one `computed()` line.

## Accessibility rules that tooling cannot enforce

Two contracts are written into the source as comments because no linter will
catch a violation:

- **Status is never conveyed by colour alone** (WCAG 1.4.1). Every status chip
  carries an icon and a text label; colour is decoration on top. See the header
  comment in `src/tailwind.css`.
- **Angular Aria ships no styles.** Its widgets are keyboard-navigable but
  invisibly so until styled. `src/styles.scss` therefore sets a global
  `:focus-visible` indicator rather than relying on browser defaults, which
  disappear under custom backgrounds.
