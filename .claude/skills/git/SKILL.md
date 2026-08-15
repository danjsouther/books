---
name: git
description: Rules on commits, branches, and merges in this repo
license: MIT
---

# Commits
- **One logical change per commit.** Don't mix a refactor with a behavior change,
  or a dependency bump with a feature.
- If the repo keeps a `CHANGELOG.md`, update it in the same commit as the change
  it describes — not as a follow-up.
- A version bump is its own commit: version files (`package.json`, etc.) plus the
  changelog roll-up and any docs that quote the version, and nothing else.
- **Message format**: a single line, sentence-case, ending in a period, describing
  the outcome (not the mechanism) — e.g. "Let a reader resume a book from the
  last page they finished." Match the style already in `git log`; don't add a
  body unless the change genuinely needs one — if it does, use it for *why*, not
  a restatement of the diff.
- **Never** `--no-verify`, `--no-gpg-sign`, or force-push a shared branch. If a
  hook fails, fix the cause.
- Prefer a new commit over `--amend` once a commit has left your hands (pushed,
  or reviewed) — amending rewrites history someone else may already have.
- Never commit secrets, `.env` files, credentials, or build output. If something
  shouldn't be tracked, add it to `.gitignore` in the same commit.

## Writing the message without mangling it
This repo may be worked on from two shells with incompatible quoting — Git Bash
(POSIX `sh`) and PowerShell. A multi-line message quoted for the wrong one does
not fail; it commits, with the quoting characters embedded in the message. A
PowerShell here-string (`@'…'@`) run through Bash has produced a commit whose
subject line was a bare `@`, with a second `@` after the trailer.

**Pipe the message in on stdin, using the form that matches the shell you are
actually calling** — never `-m` with a multi-line string:

```bash
# Bash tool — quoted heredoc ('EOF'), so $ and ` stay literal
git commit -F - <<'EOF'
Subject line here.

Co-Authored-By: …
EOF
```

```powershell
# PowerShell tool — single-quoted here-string PIPED in; closing '@ at column 0
@'
Subject line here.

Co-Authored-By: …
'@ | git commit -F -
```

The pipe is not optional. `git commit -F - @'…'@` puts the here-string in
`argv`, where `git` reads it as a pathspec and fails with "did not match any
file(s) known to git" — `-F -` only ever reads stdin.

Either shell can also take `-F <file>`, which is the safest option for a long
message: write it with the Write tool, then point `git commit` at it.

**Then read it back**, with line ends made visible — `git log -1 --format=%B`
alone renders a stray `@` or a swallowed newline as ordinary-looking text:

```bash
git log -1 --format=%B | cat -A                          # Bash
```
```powershell
git log -1 --format=%B | ForEach-Object { "[$_]" }       # PowerShell (no cat -A)
```

Fix a bad message with `--amend` *while the commit is still local* — see the
rule above about commits that have left your hands.

## Changelog entries
If the repo has a `CHANGELOG.md`, it follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): newest-first under
`## Unreleased`, one entry per change:

```
### Category — Title (YYYY-MM-DD)

Prose description of what changed and why, written for someone reading the
history later, not for the PR.
```

`Category` is `Added`, `Changed`, `Fixed`, or `Removed`. Date is the day the
work landed. A version bump moves the `## Unreleased` entries under a new
`## x.y.z` heading (semver — matching the version bumped in every package
manifest in the repo), inserted above the previous version heading, in the same
commit as the version files. **Tag the release `v<version>`** (e.g. `v0.2.0`)
once that commit lands.

# Branches
**[references/branching.md](references/branching.md) is the full and only
statement of the branching strategy** — which branches are long-lived, how they
are named, and the feature, release, and hotfix sequences step by step, plus the
GitHub branch-protection settings. Read it before branching, releasing, or
hotfixing; don't work from memory of a summary.

# Merges
Which branch merges into which, and with what flags, is part of the branching
strategy — see the reference above. The rules here are about the mechanics of
the merge itself.

- **When merging a PR via `gh pr merge`, always pass `-t`/`--subject`** with a
  message in the same style as [Commits](#commits) above (sentence case,
  outcome not mechanism, ending in a period) — never the default "Merge pull
  request #N from owner/branch". Example:
  `gh pr merge 12 --merge -t "Let a reader delete a book from the library screen."`
  A release-sync PR (e.g. `main` → `dev` to fast-forward after a release) is the
  one exception — its default title is already descriptive enough.
- Resolve conflicts by understanding both sides, never by blanket `--ours` /
  `--theirs`. Re-run the build and tests after any non-trivial resolution.

# Line endings
Pin `eol=lf` project-wide in `.gitattributes` — a deliberate override of
whatever `core.autocrlf` the local machine has set. Never "fix" line endings on
a file by hand or fight `.gitattributes` per-commit; if a file is showing as
fully rewritten, suspect the *attributes*, not the content. A CRLF shell script
or Dockerfile is a syntax error inside a Linux container, not a cosmetic issue.
