# Books

A private reading tracker for a Discord friend group. Members sign in with
Discord, add books and group them into series, track their own reading status
and rating, and see upcoming releases on a calendar. A Discord bot answers
`/upcoming` from the same data.

Everything is behind a login — there are no public pages.

## Status

Early. The foundation is in place (strict TypeScript, linting, Tailwind, the app
shell) and the workspace is split into a web app, an API server, and shared
packages — but the API serves only `/health` so far, and the database,
authentication, and features are not built yet. See
[docs/architecture.md](docs/architecture.md) for the decisions made so far and
[docs/TODO.md](docs/TODO.md) for the backlog.

## Requirements

- Node 24
- npm 11

## Layout

One npm package, one `node_modules`, with internal boundaries drawn by TypeScript
path aliases rather than workspaces — nothing here is published and everything
deploys together.

```
apps/web       Angular browser build (angular.json project "web")  → dist/web
apps/server    Express — hosts /api/v1 and serves dist/web         → dist/server
packages/domain  isomorphic: shared types and pure functions       @books/domain
packages/api     server-only: the API as a mountable router        @books/api
scripts/       esbuild build for the Node processes
```

`apps/web` is only allowed to see `@books/domain`; its tsconfig omits every other
alias, so an import of server-only code is a compile error rather than a review
catch.

## Getting started

```bash
npm ci
npm run dev
```

`npm run dev` runs both processes: the Angular dev server on
http://localhost:4200 and the API on port 4000. The dev server proxies `/api` to
the API, so the browser only ever talks to one origin.

## Scripts

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Dev server plus the API, both watching             |
| `npm run build`        | Browser bundle and server bundle into `dist/`      |
| `npm start`            | Runs the built server — API plus the built web app |
| `npm test`             | Unit tests (Vitest, via the Angular CLI builder)   |
| `npm run lint`         | ESLint over TypeScript and templates               |
| `npm run lint:fix`     | ESLint with autofix                                |
| `npm run typecheck`    | `tsc -b`, no emit beyond `out-tsc`                 |
| `npm run format`       | Prettier, write                                    |
| `npm run format:check` | Prettier, check only — this is what CI runs        |

CI runs `format:check`, `lint`, `typecheck`, `build`, and `test` on every push
and pull request to `main` and `dev`.

## Conventions

Angular and TypeScript conventions for this project are in
[.claude/CLAUDE.md](.claude/CLAUDE.md) and are enforced by ESLint where a rule
exists for them. Git branching, commit, and changelog rules are in
[.claude/skills/git/](.claude/skills/git/).

Accessibility is a requirement, not a nice-to-have: the app must pass axe checks
and meet WCAG AA, including focus management, colour contrast, and ARIA.
