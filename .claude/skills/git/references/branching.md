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

1. Nothing is committed directly to `main` or `dev` — both are protected by a
   GitHub ruleset that requires the "Build and test" status check before any
   ref update, and that check only ever reports against a PR, so every
   landing on either branch goes through one. There's no reviewer to wait on
   for a solo repo, but the PR itself isn't optional.
2. A short-lived branch (`feature/`, `fix/`, `chore/`) lands on `dev` via a
   **squash**-merged PR. A release or hotfix lands on `main` via PR as a
   `--no-ff` merge. Syncing `main` back into `dev` afterward is also a
   `--no-ff` merge, landed via PR the same way. Nothing ever merges *into* a
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

Branch from `dev`, rebase onto `dev`, push the branch, and open a PR into
`dev`. `dev`'s ruleset blocks a direct push regardless of who's pushing, so
this is the only way in — squash-merge the PR once the "Build and test" check
passes; there's no review to wait on beyond that.

```bash
git switch dev && git pull
git switch -c feature/thing

# ... work, committing per the rules in .claude/skills/git/SKILL.md,
#     including a CHANGELOG.md entry under ## Unreleased ...

git fetch origin
git rebase origin/dev          # never `git merge dev`
git push -u origin feature/thing
gh pr create --base dev --title "..." --body "..."   # one line, sentence-case,
                                                       # outcome-focused — see SKILL.md
# wait for the "Build and test" check, then:
gh pr merge --squash --delete-branch

git switch dev && git pull
```

## Release flow

Both `main` and `dev` require a PR to land anything — see rule 1 above.

Prepare the release commit on its own branch, PR it into `dev` as a squash
merge, then PR `dev` into `main`:

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
#    diverged by exactly that one commit) — via a PR, merged as --no-ff
#    (not squashed, so dev's history still shows the real merge commit):
git switch dev && git pull
git switch -c chore/sync-main-into-dev
git merge --no-ff main
git push -u origin chore/sync-main-into-dev
gh pr create --base dev --title "Sync dev with main after v0.5.0." --body "..."
gh pr merge --merge --delete-branch

git switch dev && git pull
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

# sync it the same way as after a release — via a PR, merged as --no-ff:
git switch dev && git pull
git switch -c chore/sync-main-into-dev
git merge --no-ff main
git push -u origin chore/sync-main-into-dev
gh pr create --base dev --title "Sync dev with main after v0.5.1." --body "..."
gh pr merge --merge --delete-branch
git switch dev && git pull
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

- **Require status checks to pass** → select the repo's CI job, same as
  `main`. This is enforced on *every* ref update, direct push included —
  there's no "bypass for repo admins" exception in practice, so the only way
  a commit reaches `dev` is through a PR that lets the check run and pass.
  Approvals can be 0; **do not** also turn on "Require a pull request before
  merging" as a separate toggle unless you want that redundantly enforced —
  the status-check requirement alone already forces a PR.
- **Block force pushes** and **restrict deletions.**

Nothing merges into `main` except `dev` or a `hotfix/*` branch. That one is a
convention — GitHub cannot restrict a PR by source branch.
