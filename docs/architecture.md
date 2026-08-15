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
