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
