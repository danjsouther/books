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

## A book is identified by its ASIN

The catalog is Amazon-sourced, so a book's identifier is an **ASIN**, not an
ISBN-13. Ten characters, `^[A-Z0-9]{10}$`, which covers both Amazon's own ASINs and
the ISBN-10s Amazon uses as the ASIN for most books — including the trailing `X` an
ISBN-10 check digit can carry.

It is **nullable**, so a book with no Amazon page can still be added by hand, and
Postgres treats NULLs as distinct, so any number of those coexist. Duplicate
detection protects only the books that have one.

## ASIN uniqueness is scoped to live rows

```sql
CREATE UNIQUE INDEX books_live_asin_key ON books (asin) WHERE deleted_at IS NULL;
```

This states the invariant directly: **no two live books may share an ASIN, and any
number of trashed ones may.** A trashed book cannot block re-adding the same title,
and an ASIN can be deleted and recreated without limit.

> **This replaces a version-keyed scheme** — `UNIQUE (asin, version)`, on the
> reasoning that a deletion always bumps the version, so a deleted record sits at
> version ≥ 2 while a new one is at version 1. That scheme is broken in two ways,
> and the integration specs demonstrate both. It **fails on the second delete**:
> deleting the recreated record also needs `(asin, 2)`, which the first trashed
> record already occupies permanently — so an ASIN can be recycled exactly once and
> then never again. And it **does not enforce the actual rule**, because two _live_
> records sitting at different versions satisfy it happily. The partial index is
> both correct and simpler. Its one stated drawback — that a partial index cannot be
> named in `ON CONFLICT ON CONSTRAINT` — costs nothing here, because no write uses
> `ON CONFLICT` at all; duplicates are caught by the explicit check below, which is
> where a readable message has to come from anyway.

**The index is a backstop.** The authoritative live-duplicate check happens inside
the mutation helper's transaction, under
`pg_advisory_xact_lock(namespace, hashtext(key))`, so two concurrent creates cannot
both pass it — the second waits, then sees the first one's row. That check is also
where the good error message comes from: a member should read "a book with ASIN
0316129089 already exists", never a raw constraint violation.

**Restore can legitimately fail.** If someone reused the ASIN while the book sat in
the trash, restoring it returns `409` rather than producing two live books with one
ASIN. Restoring is otherwise an ordinary edit, so it goes through the same duplicate
check as any other.

## Series names are deliberately not unique

A series name is a **label on a grouping**, not an identity. Two members who both add
"Chronicles" have made a mess they can sort out between themselves; the machinery to
prevent it — an advisory lock, a duplicate check on every write, a restore that can
fail, and a readable error at each of those points — is not worth it at this scale.

Contrast `authors` below, where the name **is** the identity: books are linked to it
and filtered by it, so two rows for one person is a defect rather than an annoyance.
That asymmetry is the reason one is unique and the other is not.

**Deleting a series does not touch its books.** `books.series_id` stays intact so a
restore is lossless; while the series is deleted the join resolves to nothing and its
books render as unattached. That is a genuine advantage over `ON DELETE SET NULL`,
which loses the association permanently.

## Slugs are permanent, and their uniqueness is global

`books` and `series` each carry a `slug` — a URL-friendly identifier
(`mistborn-the-final-empire`) generated once, at creation, from `title`/`name`.
It exists purely so a URL can be readable instead of a bare UUID; `id` stays
the real internal identifier everywhere else — foreign keys, revision tables,
the activity feed. Member profile URLs are deliberately **not** slugged — they
stay on the raw `id` — since a member's Discord identity has no field that is
both stable and meant to be public the way a book's title is.

**A slug never changes once assigned**, even across an edit that changes the
field it was derived from. This is the same permanence contract `id` already
has: a bookmarked or shared URL must keep working, so nothing regenerates a
slug on write.

**Slug uniqueness is global, not scoped to live rows** — the deliberate
opposite of `books_live_asin_key` above. A trashed book still needs a
resolvable URL, both on the `/trash` page and in historical `/changes` entries,
so a new live book must never be allowed to steal a soft-deleted one's slug.
Where the ASIN index carries `WHERE deleted_at IS NULL`, `books_slug_key` and
`series_slug_key` deliberately do not.

**Collisions get a numeric suffix.** Two books titled "Dune" become
`dune` and `dune-2`. The candidate is checked against the current transaction
before insert, and a unique-violation on the actual insert — the rare case of
two concurrent creates picking the same candidate — is caught and retried with
the next suffix; the unique index is the backstop, the same relationship the
ASIN section above describes between its own check and its index.

**Resolution is transparent between id and slug.** The API layer accepts
either form on any book or series route that takes an id — an Express
`router.param` handler detects the UUID shape and, when the value isn't one,
resolves it to the real id by slug before any route handler runs. This is what
let existing internal API calls (delete, restore, shelf status, revisions)
keep working unmodified once the frontend started routing on slugs instead of
ids.

**`users.username` is unique case-insensitively**, mirroring
`authors_name_lower_key` — two members named `books_fan` and `Books_Fan` is a
defect, not a cosmetic annoyance. This is unrelated to slugging: members are
identified in URLs by `id`, same as before.

## Authors are a lookup; authorship is catalog history

`books` has **no authors column**. Authorship lives in `authors` (id, name) and
`author_books` (author, book, position).

> **This reverses an earlier decision** to keep `authors text[]` on the book, which
> was defended on the grounds that a friend group entering books by hand does not
> need an autocomplete UI and a merge tool. The array could not express author
> _identity_: there was nothing to link to, nothing to filter reliably by, and a
> misspelling had to be corrected on every book that repeated it.

`authors` is a lookup table — no `version`, no `deleted_at`, no revisions. Its names
are unique case-insensitively (`authors_name_lower_key` on `lower(name)`), and
`resolveAuthors` folds a differently-cased name onto the existing row rather than
creating a second one. New names are inserted with `ON CONFLICT DO NOTHING` and then
re-selected, so two transactions naming the same new author concurrently produce one
row instead of an error.

`author_books.position` records **credited order**, which the `text[]` preserved for
free and a join table otherwise loses. "Terry Pratchett and Stephen Baxter" stays in
that order instead of collapsing to alphabetical.

**Changing a book's authors is a book edit.** It goes through the same mutation path
as any other field: the version bumps and one revision is appended. Because the
authors no longer live in the row, `book_revisions.snapshot` carries them explicitly
as `authors: [{ id, name }]`, resolved at write time — names so a diff renders
without a second lookup, ids so a revert re-links to exactly the same rows. Without
that, history would silently lose a whole category of edit.

The gap this leaves is deliberate and worth stating: **an author row's own name has
no history.** Correcting a typo in "Marha Wells" is not versioned and cannot be
reverted. A book's _authorship_ is fully versioned; the author's name is not.

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

**`percent_read` and `public_note` are public; `note` is private.** All three live
on `book_user_status` beside `rating`, for the same reason: they're attributes of
the user/book relationship. `percent_read` (0–100, nullable) and `public_note`
(free text, nullable) are visible to any member, same as `rating` — they appear in
the "everyone's take" panel and in `GET /users/:id/shelf`. Marking a book
`completed` forces `percent_read` to 100 (see `upsertShelfStatus`), overriding
whatever the patch itself said — finishing a book means 100% by definition. No
other status transition touches it. `note` is visible only to
its own owner and is never selected into a query result that isn't scoped to the
requesting viewer's own row — see `PublicBookStatus` vs `UserBookStatus` in
`@books/domain`, and `toPublicBookStatus`/`toUserBookStatus` in `queries/books.ts`.

**`book_user_status` is the one table with a hard delete.** Removing a book from
your shelf really removes the row. Soft-deleting it would collide with the
`(book_id, user_id)` primary key and make the upsert path meaningfully worse, and
unlike catalog data it is your own row, recreatable in one click.

**`users.avatar_hash` stores the hash, not a URL.** Discord's CDN path format has
changed before, and a 32-character hash is far cheaper to migrate than a stored
URL.

**A revert never restores a deletion.** `deletedAt` and `deletedBy` are taken from
the current row rather than the target snapshot, so reverting to a version that
happened to be deleted does not trash the record. Delete and restore are explicit
operations, and a button labelled "Restore this version" must never do the opposite.

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

**A column that needs backfilling before it can go `NOT NULL` deploys in two
migrations, with a script run by hand in between.** The `slug` columns are the
example: migration one adds the column nullable, `npm run db:backfill-slugs`
(also a standalone entry point, same shape as `db:migrate`/`db:seed`) fills in
every existing row, and only then does migration two add `NOT NULL` and the
unique indexes. Running migration two before the backfill fails loudly — a
`NOT NULL` violation on whatever rows are still unfilled — which is an
acceptable guard rail for a step that has to happen in order regardless.
