# Books

A private reading tracker for a Discord friend group. Members sign in with
Discord, add books and group them into series, track their own reading status
and rating, and see upcoming releases on a calendar. A Discord bot answers
`/upcoming` from the same data.

Everything is behind a login — there are no public pages.

## Status

Early. The foundation is in place (strict TypeScript, linting, Tailwind, the app
shell), the workspace is split into a web app, an API server, and shared packages,
the database schema exists with migrations and seed data, and Discord login works
end to end — access and refresh tokens, cookie and bearer transport, CSRF
protection. The book/series/calendar features themselves are not built yet. See
[docs/architecture.md](docs/architecture.md) for the decisions made so far,
[docs/data-model.md](docs/data-model.md) for the schema, and
[docs/TODO.md](docs/TODO.md) for the backlog.

## Requirements

- Node 24
- npm 11
- Postgres 17 (Docker is enough — see below)
- A Discord application, for login (see below)

## Layout

One npm package, one `node_modules`, with internal boundaries drawn by TypeScript
path aliases rather than workspaces — nothing here is published and everything
deploys together.

```
apps/web       Angular browser build (angular.json project "web")  → dist/web
apps/server    Express — hosts /api/v1 and serves dist/web         → dist/server
packages/domain  isomorphic: shared types and pure functions       @books/domain
packages/api     server-only: the API, auth, and middleware        @books/api
packages/db      server-only: schema, migrations, queries, seed    @books/db
packages/config  server-only: env parsing, fails fast at boot      @books/config
scripts/       esbuild build for the Node processes
```

`apps/web` is only allowed to see `@books/domain`; its tsconfig omits every other
alias, so an import of server-only code is a compile error rather than a review
catch.

## Getting started

```bash
npm ci

# A throwaway database. Compose replaces this in the deployment phase.
docker run -d --name books-dev-postgres \
  -e POSTGRES_USER=books -e POSTGRES_PASSWORD=books -e POSTGRES_DB=books \
  -p 5432:5432 postgres:17

export DATABASE_URL=postgres://books:books@localhost:5432/books
npm run db:migrate
npm run db:seed

cp .env.example .env   # then fill it in — see below
npm run dev
```

`npm run dev` runs both processes: the Angular dev server on
http://localhost:4200 and the API on port 4000. The dev server proxies `/api` to
the API, so the browser only ever talks to one origin.

### Discord login

The API validates its environment at boot and refuses to start if anything is
missing or malformed — see `packages/config/src/env.ts` for the full shape, and
[.env.example](.env.example) for every variable with a comment on what it is
for. Three of them come from a Discord application you create yourself
([discord.com/developers/applications](https://discord.com/developers/applications)):

- **`DISCORD_CLIENT_ID`** / **`DISCORD_CLIENT_SECRET`** — from the application's
  OAuth2 page.
- **`DISCORD_REDIRECT_URI`** — must be registered on that same page _exactly_,
  including the path. In dev this is the web app's own origin
  (`http://localhost:4200/api/v1/auth/discord/callback`), not the API's —
  the dev-server proxy is what makes that work.
- **`DISCORD_ALLOWED_GUILD_ID`** — the Discord server (guild) id that gates
  access. Anyone outside it authenticates successfully with Discord but is
  rejected at the callback; this is the actual access control, not a filter.

`AUTH_JWT_SECRET` needs 32+ random characters —
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
generates one.

## Tests

`npm test` runs both suites. The Angular unit tests need nothing; the Node suite
(`npm run test:node`) covers the shared packages, and its integration specs need
`DATABASE_URL` pointing at a real Postgres — they test check constraints, advisory
locks, and transaction boundaries, which have no meaningful in-memory equivalent.
Without `DATABASE_URL` those specs skip themselves, so the rest still runs; CI
always sets it.

## Scripts

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Dev server plus the API, both watching             |
| `npm run build`        | Browser bundle and server bundle into `dist/`      |
| `npm start`            | Runs the built server — API plus the built web app |
| `npm test`             | Both test suites                                   |
| `npm run test:web`     | Angular unit tests (Vitest, via the CLI builder)   |
| `npm run test:node`    | Package and integration tests (needs Postgres)     |
| `npm run db:generate`  | Generate a migration from the schema               |
| `npm run db:migrate`   | Apply pending migrations                           |
| `npm run db:seed`      | Wipe and reseed the development fixtures           |
| `npm run db:studio`    | Drizzle Studio against `DATABASE_URL`              |
| `npm run lint`         | ESLint over TypeScript and templates               |
| `npm run lint:fix`     | ESLint with autofix                                |
| `npm run typecheck`    | `tsc -b`, no emit beyond `out-tsc`                 |
| `npm run format`       | Prettier, write                                    |
| `npm run format:check` | Prettier, check only — this is what CI runs        |

CI runs `format:check`, `lint`, `typecheck`, `build`, and the Angular tests on
every push and pull request to `main` and `dev`, and runs the Node suite in a
second job against a Postgres service container.

## Conventions

Angular and TypeScript conventions for this project are in
[.claude/CLAUDE.md](.claude/CLAUDE.md) and are enforced by ESLint where a rule
exists for them. Git branching, commit, and changelog rules are in
[.claude/skills/git/](.claude/skills/git/).

Accessibility is a requirement, not a nice-to-have: the app must pass axe checks
and meet WCAG AA, including focus management, colour contrast, and ARIA.
