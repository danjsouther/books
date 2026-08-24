# Branching

Three tiers. `main` is what is deployed, `dev` is what is finished but not yet
released, and everything else is short-lived and branched from `dev`.

```
main   ──●──────────────●  (v0.4.0)        (v0.5.0)
          \             /
dev     ●──●──●──●──●──●──●
            \  /   \  /
feature/a    ●●     ●●  feature/b
```

`main` and `dev` are both required. If the repo has no `dev` yet, create it
before starting work:

```bash
git switch main && git pull
git switch -c dev
git push -u origin dev
```

Three rules hold everywhere below:

1. Nothing is committed directly to `main` — it's protected by a GitHub
   ruleset that requires the "Build and test" status check before any ref
   update, and that check only ever reports against a PR, so every landing
   on `main` goes through one. There's no reviewer to wait on for a solo
   repo, but the PR itself isn't optional. `dev` carries no such
   requirement (the status-check rule was deliberately removed there) —
   direct commits and direct pushes to `dev` are fine.
2. A short-lived branch (`feature/`, `fix/`, `chore/`) can land on `dev`
   either by a direct push/merge or via a squash-merged PR — both work now
   that `dev` has no required status check; use whichever fits the size of
   the change. A release or hotfix still lands on `main` via PR as a
   `--no-ff` merge. Syncing `main` back into `dev` afterward is also a
   `--no-ff` merge. Nothing ever merges *into* a short-lived branch — rebase
   instead.
3. A short-lived branch is deleted once it's merged.

## The branches

| Branch | Lives | Holds | Written by |
| --- | --- | --- | --- |
| `main` | forever | production; every commit is a tagged release | release merges and hotfixes only |
| `dev` | forever | the integration line — finished work awaiting a release | direct commits and feature merges |
| `<type>/<summary>` | days | one change | you |

### Naming

`<type>/<short-kebab-summary>`, where `type` is one of:

- `feature/` — new behaviour
- `fix/` — a bug fix that can wait for the next release
- `chore/` — tooling, docs, dependencies, refactors with no user-visible effect
- `hotfix/` — a fix for production urgent enough to bypass `dev`

e.g. `feature/resume-from-last-page`. Leave pre-existing bare branch names
alone; don't rename in flight.

## Feature flow

`dev` has no required status check, so landing on it doesn't require a PR —
a direct commit, or a direct push/merge from a short-lived branch, is fine.
Reach for a branch when a change is large enough to want isolation while
it's in progress; small changes can go straight to `dev`.

Direct to `dev`:

```bash
git switch dev && git pull

# ... work, committing per the rules in .claude/skills/git/SKILL.md,
#     including a CHANGELOG.md entry under ## Unreleased ...

git push
```

Via a short-lived branch, merged directly (no PR needed):

```bash
git switch dev && git pull
git switch -c feature/thing

# ... work ...

git fetch origin
git rebase origin/dev          # never `git merge dev`
git switch dev && git pull
git merge --ff-only feature/thing   # or --squash, for one commit on dev
git push
git branch -d feature/thing
```

A PR into `dev` is still fine when you want CI to run before it lands, or
want a record of the change as a PR — `gh pr create --base dev --title "..."`
(one line, sentence-case, outcome-focused — see SKILL.md) then
`gh pr merge --squash --delete-branch`. It's just optional now, not required.

## Release flow

`main` requires a PR to land anything (rule 1 above); `dev` doesn't, but
routing the release commit through a PR into `dev` first still means CI
verifies it before it's promoted to `main`.

Prepare the release commit on its own branch, PR it into `dev` as a squash
merge (or merge it directly, per the Feature flow above), then PR `dev` into
`main`:

```bash
git switch dev && git pull
git switch -c chore/release-0.5.0

# 1. Roll the CHANGELOG: move everything under ## Unreleased beneath a new
#    ## x.y.z heading, above the previous version.
# 2. Bump `version` in every package manifest in the repo.
# 3. Commit both together — "Release 0.5.0."
git push -u origin chore/release-0.5.0
gh pr create --base dev --title "Release 0.5.0." --body "..."
# wait for the "Build and test" check, then:
gh pr merge --squash --delete-branch

git switch dev && git pull

# open a PR from dev into main ("Release 0.5.0."), wait for status checks,
# merge --no-ff

git switch main && git pull
git tag v0.5.0
git push origin v0.5.0

# 4. Sync dev with the merge commit main just gained (main and dev have
#    diverged by exactly that one commit) — a --no-ff merge (not squashed,
#    so dev's history still shows the real merge commit), pushed straight to
#    dev since it has no required status check. Route it through a PR
#    instead if you'd rather see it run CI first:
git switch dev && git pull
git merge --no-ff main
git push
```

Version numbers follow [semver](https://semver.org/spec/v2.0.0.html); once the
repo has one release commit, copy its shape for the next.

## Hotfix flow

Only for something broken in production that cannot wait for whatever is
sitting on `dev`.

```bash
git switch main && git pull
git switch -c hotfix/thing
# ... fix, changelog entry, patch version bump ...
# PR into main, merge --no-ff, tag v0.5.1

# sync it the same way as after a release — a --no-ff merge pushed
# straight to dev:
git switch dev && git pull
git merge --no-ff main
git push
```

**Do not skip the last step.** A hotfix on `main` but not `dev` comes back as a
regression at the next release.

## Protecting the branches on GitHub

Set these in the repo's **Settings → Rules → Rulesets** (or Settings → Branches
→ Add branch protection rule) — they cannot be enforced from the repo.

For **`main`**:

- **Require a pull request before merging** — leave "Allow specified actors to
  bypass" empty, including for yourself. Approvals can be 0 on a solo repo.
- **Require status checks to pass** → select the repo's CI job (defined in
  `.github/workflows/`). The check only appears in that list after it has run
  once, so open a throwaway PR first if the box is empty.
- **Require branches to be up to date before merging.**
- **Block force pushes** and **restrict deletions**.

For **`dev`**:

- No required status check — this was deliberately removed, so direct
  commits and direct pushes to `dev` are allowed. Re-add "Require status
  checks to pass" (same CI job as `main`) if `dev` should go back to
  PR-only landings.
- **Block force pushes** and **restrict deletions.**

Nothing merges into `main` except `dev` or a `hotfix/*` branch. That one is a
convention — GitHub cannot restrict a PR by source branch.
