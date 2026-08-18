# Books

A private reading tracker for a Discord friend group. Members sign in with
Discord, add books and group them into series, track their own reading status
and rating, and see upcoming releases on a calendar. A Discord bot answers
`/upcoming` from the same data.

Everything is behind a login — there are no public pages.

## Status

Feature-complete against the initial plan. Books, series, and their revision
history; a release calendar and list with a Discord-bot `/upcoming` command;
an activity feed and a changes feed; and Docker Compose for deployment are
all in place, alongside Discord login (access/refresh tokens, cookie and
bearer transport, CSRF protection). See
[docs/architecture.md](docs/architecture.md) for the decisions made along the
way, [docs/data-model.md](docs/data-model.md) for the schema, and
[docs/TODO.md](docs/TODO.md) for what's still open.

## Requirements

- Node 24
- npm 11
- Postgres 17 (Docker is enough — see below)
- Docker + Docker Compose, for a production-shaped deployment (optional for
  day-to-day development — see below)
- A Discord application, for login and the bot (see below)

## Layout

One npm package, one `node_modules`, with internal boundaries drawn by TypeScript
path aliases rather than workspaces — nothing here is published and everything
deploys together.

```
apps/web       Angular browser build (angular.json project "web")  → dist/web
apps/server    Express — hosts /api/v1 and serves dist/web         → dist/server
apps/bot       The Discord bot — its own gateway client            → dist/bot
packages/domain  isomorphic: shared types and pure functions       @books/domain
packages/api     server-only: the API, auth, and middleware        @books/api
packages/db      server-only: schema, migrations, queries, seed    @books/db
packages/config  server-only: env parsing, fails fast at boot      @books/config
scripts/       esbuild build for the Node processes
docker/        Postgres initdb scripts (docker-compose.yml)
```

`apps/web` is only allowed to see `@books/domain`; its tsconfig omits every other
alias, so an import of server-only code is a compile error rather than a review
catch.

## Getting started

```bash
npm ci

# A throwaway database — just Postgres, not the full Compose stack, since
# `npm run dev` runs everything else with hot reload instead of a container.
docker run -d --name books-dev-postgres \
  -e POSTGRES_USER=books -e POSTGRES_PASSWORD=books -e POSTGRES_DB=books \
  -p 5432:5432 postgres:17

export DATABASE_URL=postgres://books:books@localhost:5432/books
npm run db:migrate
npm run db:seed

cp .env.example .env   # then fill it in — see below
npm run dev
```

`npm run dev` runs three processes: the Angular dev server on
http://localhost:4200, the API on port 4000, and the Discord bot. The dev
server proxies `/api` to the API, so the browser only ever talks to one
origin.

### Running the full stack with Docker Compose

`docker-compose.yml` builds and runs everything — Postgres, a one-shot
migration step, the server, and the bot — the way a real deployment would,
rather than the hand-run Postgres container above plus three `npm run dev`
watchers.

```bash
cp .env.example .env   # fill in the app's own variables, then the
                        # "Docker Compose only" block at the bottom
docker compose up --build
```

Migrations run once, in their own `migrate` service, before `server`/`bot`
start — never at application boot, so two containers can never race each
other applying the same migration. The bot connects as a separate,
read-only Postgres role (`books_bot`, created by
[docker/initdb/01-books-bot-role.sh](docker/initdb/01-books-bot-role.sh)) —
it can `SELECT` but nothing else, at the database level, not just by
convention in its own code. See
[docs/architecture.md](docs/architecture.md) for why.

Slash commands are **not** registered automatically — `docker compose up`
brings the bot online but Discord has no record of its commands until you
run, once per command-definition change:

```bash
docker compose run --rm bot node dist/bot/deploy-commands.js
```

This reuses the already-built `bot` image and its container's own env, so it
needs no local `node_modules` or `.env` on the host — just the stack already
brought up once with `--build`.

### Discord login and the bot

Both the server and the bot validate their environment at boot and refuse to
start if anything is missing or malformed — see
`packages/config/src/env.ts` for the exact shape each one requires (they're
deliberately different schemas, not one shared list — a bot container has no
reason to require `AUTH_JWT_SECRET`, and the server has no reason to require
`DISCORD_BOT_TOKEN`), and [.env.example](.env.example) for every variable
with a comment on what it is for. From a Discord application you create
yourself
([discord.com/developers/applications](https://discord.com/developers/applications)):

- **`DISCORD_CLIENT_ID`** / **`DISCORD_CLIENT_SECRET`** — from the application's
  OAuth2 page, for the web login flow.
- **`DISCORD_REDIRECT_URI`** — must be registered on that same page _exactly_,
  including the path. In dev this is the web app's own origin
  (`http://localhost:4200/api/v1/auth/discord/callback`), not the API's —
  the dev-server proxy is what makes that work.
- **`DISCORD_ALLOWED_GUILD_ID`** — the Discord server (guild) id that gates
  access. Anyone outside it authenticates successfully with Discord but is
  rejected at the callback; this is the actual access control, not a filter.
- **`DISCORD_BOT_TOKEN`** / **`DISCORD_APP_ID`** — from the application's Bot
  page, unrelated to the OAuth credentials above; the bot's `discord.js`
  client is entirely separate from the web login flow.
- **`DISCORD_GUILD_ID`** (optional) — set it for instant, guild-scoped slash
  command registration during development; leave it unset for global
  registration (up to an hour to propagate) once you're ready to deploy.
  Registration is never automatic on startup, since re-registering on every
  restart is a rate-limit hazard: run `npm run bot:deploy-commands` locally,
  or `docker compose run --rm bot node dist/bot/deploy-commands.js` against a
  Compose deployment (see above) — once after first bringing the stack up,
  and again any time the command definitions change.

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

| Script                        | What it does                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server, the API, and the bot, all watching                                                                                                  |
| `npm run build`               | Browser bundle and server bundle into `dist/`                                                                                                   |
| `npm run build:bot`           | Bot bundle into `dist/bot`                                                                                                                      |
| `npm run build:migrate`       | Standalone migration-runner bundle into `dist/migrate`                                                                                          |
| `npm start`                   | Runs the built server — API plus the built web app                                                                                              |
| `npm run bot:deploy-commands` | Registers the bot's slash commands with Discord — run by hand locally (Compose: `docker compose run --rm bot node dist/bot/deploy-commands.js`) |
| `npm test`                    | Both test suites                                                                                                                                |
| `npm run test:web`            | Angular unit tests (Vitest, via the CLI builder)                                                                                                |
| `npm run test:node`           | Package and integration tests (needs Postgres)                                                                                                  |
| `npm run db:generate`         | Generate a migration from the schema                                                                                                            |
| `npm run db:migrate`          | Apply pending migrations                                                                                                                        |
| `npm run db:seed`             | Wipe and reseed the development fixtures                                                                                                        |
| `npm run db:studio`           | Drizzle Studio against `DATABASE_URL`                                                                                                           |
| `npm run lint`                | ESLint over TypeScript and templates                                                                                                            |
| `npm run lint:fix`            | ESLint with autofix                                                                                                                             |
| `npm run typecheck`           | `tsc -b`, no emit beyond `out-tsc`                                                                                                              |
| `npm run format`              | Prettier, write                                                                                                                                 |
| `npm run format:check`        | Prettier, check only — this is what CI runs                                                                                                     |

CI runs `format:check`, `lint`, `typecheck`, `build`, `build:bot`,
`build:migrate`, and the Angular tests on every push and pull request to
`main` and `dev`, and runs the Node suite in a second job against a Postgres
service container. It does not build or publish Docker images — see
[docs/TODO.md](docs/TODO.md).

## Conventions

Angular and TypeScript conventions for this project are in
[.claude/CLAUDE.md](.claude/CLAUDE.md) and are enforced by ESLint where a rule
exists for them. Git branching, commit, and changelog rules are in
[.claude/skills/git/](.claude/skills/git/).

Accessibility is a requirement, not a nice-to-have: the app must pass axe checks
and meet WCAG AA, including focus management, colour contrast, and ARIA.
