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

1. Nothing is committed directly to `main` or `dev`.
2. Merges *into* `main` or `dev` are `--no-ff`; neither ever merges *into* a
   short-lived branch — rebase instead.
3. A short-lived branch is deleted once it's merged.

## The branches

| Branch | Lives | Holds | Written by |
| --- | --- | --- | --- |
| `main` | forever | production; every commit is a tagged release | release merges and hotfixes only |
| `dev` | forever | the integration line — finished work awaiting a release | feature merges |
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

Branch from `dev`, rebase onto `dev`, merge into `dev`.

```bash
git switch dev && git pull
git switch -c feature/thing

# ... work, committing per the rules in .claude/skills/git/SKILL.md,
#     including a CHANGELOG.md entry under ## Unreleased ...

git fetch origin
git rebase origin/dev          # never `git merge dev`
git push -u origin feature/thing
# open a PR into dev
```

Merge the PR with `--no-ff` (GitHub's "Create a merge commit"), then delete the
branch.

## Release flow

Prepare the release *on `dev`*, then merge into `main`.

```bash
git switch dev && git pull

# 1. Roll the CHANGELOG: move everything under ## Unreleased beneath a new
#    ## x.y.z heading, above the previous version.
# 2. Bump `version` in every package manifest in the repo.
# 3. Commit both together — "Release 0.5.0."
git push

# 4. Merge into main and tag.
git switch main && git pull
git merge --no-ff dev -m "Release 0.5.0."
git tag v0.5.0
git push origin main --follow-tags
git switch dev && git merge --ff-only main   # keep dev level with main
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

git switch dev && git merge main    # or rebase dev onto main if dev is unpushed
```

**Do not skip the last step.** A hotfix on `main` but not `dev` comes back as a
regression at the next release.

## Protecting the branches on GitHub

Set these in the repo's **Settings → Rules → Rulesets** (or Settings → Branches
→ Add branch protection rule) — they cannot be enforced from the repo.

For **`main`** and **`dev`** alike:

- **Require a pull request before merging** — leave "Allow specified actors to
  bypass" empty, including for yourself. Approvals can be 0 on a solo repo.
- **Require status checks to pass** → select the repo's CI job (defined in
  `.github/workflows/`). The check only appears in that list after it has run
  once, so open a throwaway PR first if the box is empty.
- **Require branches to be up to date before merging** — on `main` only, not
  `dev`.
- **Block force pushes** and **restrict deletions**.

Nothing merges into `main` except `dev` or a `hotfix/*` branch. That one is a
convention — GitHub cannot restrict a PR by source branch.
