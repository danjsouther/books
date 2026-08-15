# Data model

The schema lives in `packages/db/src/schema/`; the generated SQL in
`packages/db/src/migrations/` is the committed artifact and the source of truth
for what is actually deployed. This file explains the parts that are not obvious
from reading either.

## Versioning, history, and soft deletes are one mechanism

Three things that look like separate features are a single design, and they only
work together. Full-wiki permissions — where any member may edit or delete
anything — are only safe because nothing is lost, and that rests on all three:
deletion is another version rather than a removal, revision history keeps every
prior state, and the changes feed makes edits visible so a bad one gets noticed.

Both catalog tables (`books`, `series`) hold current state and carry `version`,
`deleted_at`, and `deleted_by`.

**Every mutation appends a revision.** `book_revisions` and `series_revisions` are
append-only, keyed `(entity_id, version)`, and hold a complete `snapshot` of the
record _after_ the change. A full snapshot rather than a diff: rows are small,
restore-to-version becomes a trivial write, and diffing is a pure function
computed on demand for display.

The current row is always the most recent version, and it always agrees with the
highest-numbered revision — both are written in one transaction. `version` doubles
as the optimistic-concurrency token, so a save carrying a stale version gets a
`409` instead of silently clobbering a concurrent edit.

**Deletion is a version, not a separate state.** Deleting appends a `deleted`
revision and bumps the version; restoring appends a `restored` revision and bumps
it again. A record is deleted precisely when its most recent version is a
deletion — which, since the current row _is_ the most recent version, reduces to
`deleted_at IS NULL`. Delete and restore flow through the same mutation path as
any other edit, and the full sequence of deletions and restorations is preserved
in history for free.

## Uniqueness is scoped to live rows

```sql
CREATE UNIQUE INDEX series_live_name_key   ON series (name_lower) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX books_live_isbn13_key  ON books  (isbn13)     WHERE deleted_at IS NULL;
```

This states the invariant directly: **no two live records may share a key, and any
number of trashed ones may.** A trashed _The Expanse_ cannot block a new one, and
the same name can be deleted and recreated without limit.

`series.name_lower` is a generated column (`GENERATED ALWAYS AS (lower(name))
STORED`) so that case-insensitive uniqueness and case-insensitive lookup both key
off one definition rather than repeating `lower(name)` in two places.

> **This replaces a version-keyed scheme** — `UNIQUE (name_lower, version)`, on
> the reasoning that a deletion always bumps the version, so a deleted record sits
> at version ≥ 2 while a new one is at version 1. That scheme is broken in two
> ways, and the integration specs demonstrate both. It **fails on the second
> delete**: deleting the recreated record also needs `(name, 2)`, which the first
> trashed record already occupies permanently — so a name can be recycled exactly
> once and then never again. And it **does not enforce the actual rule**, because
> two _live_ records sitting at different versions satisfy it happily. The partial
> index is both correct and simpler. Its one stated drawback — that a partial
> index cannot be named in `ON CONFLICT ON CONSTRAINT` — costs nothing here,
> because no write uses `ON CONFLICT` at all; duplicates are caught by the
> explicit check below, which is where a readable message has to come from anyway.

**The index is a backstop.** The authoritative live-duplicate check happens inside
the mutation helper's transaction, under
`pg_advisory_xact_lock(namespace, hashtext(lower(key)))`, so two concurrent creates
cannot both pass it — the second waits, then sees the first one's row. That check
is also where the good error message comes from: a member should read "a series
named _The Expanse_ already exists", never a raw constraint violation.

Two behaviours follow, and both are tested:

- **Restore can legitimately fail.** If someone reused the name while the record
  sat in the trash, restoring it returns `409` rather than producing two live
  records with the same name. Restoring is otherwise an ordinary edit, so it goes
  through the same duplicate check as any other.
- **Deleting a series does not touch its books.** `books.series_id` stays intact
  so a restore is lossless; while the series is deleted the join resolves to
  nothing and its books render as unattached. That is a genuine advantage over
  `ON DELETE SET NULL`, which loses the association permanently.

## Every read must filter `deleted_at IS NULL`

Forgetting it in one query is _the_ failure mode of soft deletes, and it fails
silently. `packages/db/src/queries/active.ts` exposes `activeBooks()` and
`activeSeries()` builders that bake the predicate in, and raw table access is
confined to `packages/db`. Reviewing one package beats reviewing every call site.

## Release dates: one sortable column plus a precision

`release_date` is a `date`, never a `timestamptz` — a release date is a calendar
fact, not an instant, and `timestamptz` produces the classic off-by-one where a US
reader sees the previous day.

It always stores the **earliest date consistent with what is known**, and
`release_precision` says how much of it to believe:

| Known            | `release_date` | `release_precision` |
| ---------------- | -------------- | ------------------- |
| 5 March 2027     | `2027-03-05`   | `day`               |
| March 2027       | `2027-03-01`   | `month`             |
| Sometime in 2027 | `2027-01-01`   | `year`              |
| Nothing          | `NULL`         | `unknown`           |

A check constraint enforces `(release_precision = 'unknown') = (release_date IS
NULL)` in both directions. One sortable column means "the next ten releases" and
range queries are plain indexed queries with no `COALESCE` gymnastics, while
precision drives formatting and placement:

- **`day`** → a calendar grid cell, the release list, the bot, and eligible for a
  `book.released` event.
- **`month`** → **never a grid cell.** A "sometime in March" strip below the grid,
  plus the list and the bot. Silently pinning a month-precision book to the 1st
  would be a lie that users act on; the strip is the honest UI and it is cheap.
- **`year`** → the release list's "2027 (month TBA)" bucket, and the bot's TBA
  section.
- **`unknown`** → the book's own page and an "Undated" list section.

**Only `day` precision triggers a `book.released` event** — announcing "released!"
for a book we only know is out sometime in March would be wrong on thirty days out
of thirty-one.

## Choices worth knowing about

**`authors` is a `text[]`, not a table.** A handful of friends entering books by
hand does not justify an autocomplete UI, a merge tool, and a dedup problem. A GIN
index keeps filtering fast, and normalising later is mechanical.

**`series_position` is `numeric(6,2)`.** Decimals are required — `1.5` is the
universal novella convention — and `numeric` rather than `real` gives exact
ordering with no float surprises. It is deliberately **not** unique: two 1.5
novellas is a real thing. Ties break by `release_date NULLS LAST, title, id`.

**Rating lives in `book_user_status`, beside status.** The entity being modelled is
"this user's relationship with this book", and rating is an attribute of that
relationship, strictly 1:1 with `(user, book)`. One row makes the "everyone's take"
panel a single indexed scan with no join, and the shelf endpoint a single upsert.
Rating history is not lost either: `rating.changed` activity rows carry `from` and
`to`.

`rating` is nullable, meaning **unrated**. `0` is a legitimate score distinct from
"no opinion" — which is precisely why a nullable integer beats a sentinel.

**`book_user_status` is the one table with a hard delete.** Removing a book from
your shelf really removes the row. Soft-deleting it would collide with the
`(book_id, user_id)` primary key and make the upsert path meaningfully worse, and
unlike catalog data it is your own row, recreatable in one click.

**`users.avatar_hash` stores the hash, not a URL.** Discord's CDN path format has
changed before, and a 32-character hash is far cheaper to migrate than a stored
URL.

## Two feeds, two sources

**`activity` is a table**, append-only, written in the same transaction as the
action it records — so the feed can never disagree with the data. Its primary key
is a `bigserial` rather than a uuid because the feed is strictly
reverse-chronological and a monotonic integer gives stable keyset pagination for
free.

**The changes feed has no table.** It is a `UNION ALL` over `book_revisions` and
`series_revisions`. Every catalog mutation already writes exactly one revision, so
the change log is complete by construction; a second copy in `activity` could only
drift.

The two answer different questions and neither is a superset. Activity is _social_
— who is reading what, who rated what, what just came out. Changes is _editorial_ —
who touched the shared catalog and what they altered. `book.added` is the one event
that legitimately appears in both.

## Migrations

Generated with `npm run db:generate` and the SQL is **committed**. `drizzle-kit
push` is for local scratch only; it skips the reviewable artifact.

`npm run db:migrate` is a standalone entry point, never something the server runs
at boot — two processes racing `migrate()` on startup is a real failure mode, and
coupling schema changes to application start makes rollback impossible.
