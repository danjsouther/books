# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed — Client-side rendering only (2026-08-15)

Removed server-side rendering. Every page in this application sits behind a
Discord login, so there is nothing to render for an anonymous visitor and no
search engine to serve — while per-user server rendering carries real risk,
since HTML that varies by member must never be cached or handed to the wrong
person.

Dropping it removes hydration, transfer state, and host allow-listing from the
deployment, and leaves a single browser bundle as the only build artifact. That
artifact is also what a future desktop client will load, so the desktop path
cannot quietly break. The cost is a blank first paint until the application
boots, which is acceptable for a private tool.

### Added — Continuous integration (2026-08-14)

Every push and pull request against `main` or `dev` now builds the application
and runs the unit tests on GitHub Actions, so a branch cannot be merged without
a green build. The job is the status check that the branch protection rules
require.

### Added — Angular workspace (2026-08-14)

Scaffolded the books application as an Angular 22 workspace: standalone APIs
with zoneless change detection, routing, SCSS component styles, Vitest as the
unit test runner, and server-side rendering with prerendering. `ng build`
produces both browser and server bundles.
