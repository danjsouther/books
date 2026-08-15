# Books

A private reading tracker for a Discord friend group. Members sign in with
Discord, add books and group them into series, track their own reading status
and rating, and see upcoming releases on a calendar. A Discord bot answers
`/upcoming` from the same data.

Everything is behind a login — there are no public pages.

## Status

Early. The foundation is in place (strict TypeScript, linting, Tailwind, the app
shell); the database, API, authentication, and features are not built yet. See
[docs/architecture.md](docs/architecture.md) for the decisions made so far and
[docs/TODO.md](docs/TODO.md) for the backlog.

## Requirements

- Node 24
- npm 11

## Getting started

```bash
npm ci
npm start
```

The app runs at http://localhost:4200.

## Scripts

| Script                 | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm start`            | Dev server with hot reload                       |
| `npm run build`        | Production browser bundle into `dist/web`        |
| `npm test`             | Unit tests (Vitest, via the Angular CLI builder) |
| `npm run lint`         | ESLint over TypeScript and templates             |
| `npm run lint:fix`     | ESLint with autofix                              |
| `npm run typecheck`    | `tsc -b`, no emit beyond `out-tsc`               |
| `npm run format`       | Prettier, write                                  |
| `npm run format:check` | Prettier, check only — this is what CI runs      |

CI runs `format:check`, `lint`, `typecheck`, `build`, and `test` on every push
and pull request to `main` and `dev`.

## Conventions

Angular and TypeScript conventions for this project are in
[.claude/CLAUDE.md](.claude/CLAUDE.md) and are enforced by ESLint where a rule
exists for them. Git branching, commit, and changelog rules are in
[.claude/skills/git/](.claude/skills/git/).

Accessibility is a requirement, not a nice-to-have: the app must pass axe checks
and meet WCAG AA, including focus management, colour contrast, and ARIA.
