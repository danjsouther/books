# API

Everything below `/health` and `/auth/discord/*` requires a session — see
[architecture.md](architecture.md) for how that session works. There is no
ownership check anywhere: full wiki. `includeDeleted`, `/trash`, `/revisions`, and
`/revert` are open to every member, on the theory that if anyone can delete or edit,
anyone should be able to see it happen and undo it.

Success responses carry no envelope — a bare JSON body, shaped as noted below.
Errors always look like:

```json
{ "error": { "code": "not_found", "message": "...", "details": { "..." } } }
```

`code` is one of `not_found | validation_failed | unauthenticated | forbidden |
conflict | rate_limited | internal_error`, mapped 1:1 to `404 | 400 | 401 | 403 | 409
| 429 | 500`.

## The list contract

Every collection endpoint (except `/activity`) shares one envelope and one
pagination scheme:

```
?page=1&pageSize=20&dir=asc          (plus per-resource filters and &sort=)
→ { items: T[], page, pageSize, total }
```

`page`/`pageSize` are 1-indexed offset pagination, `pageSize` capped at 100. Every
`ORDER BY` behind these ends in an `id` tiebreaker, so a sort with ties still pages
stably. `/activity` is keyset-paginated on `id` instead — see its own section below.

## Authentication

Documented in full in `docs/architecture.md`. Summary:

|        |                          |                                                                 |
| ------ | ------------------------ | --------------------------------------------------------------- |
| `GET`  | `/auth/discord/start`    | 302 to Discord                                                  |
| `GET`  | `/auth/discord/callback` | 302 (web) or `{accessToken, refreshToken, expiresIn}` (desktop) |
| `POST` | `/auth/refresh`          | cookie or body → new token pair                                 |
| `POST` | `/auth/logout`           | 204                                                             |
| `GET`  | `/auth/me`               | `CurrentUser`                                                   |

## Books

```
GET    /books                     ListResponse<BookSummary>
         ?q&seriesId&author&status&ratedBy&releasedFrom&releasedTo&hasDate&includeDeleted
         &sort=title|release|created|updated|rating&dir&page&pageSize
POST   /books                     BookCreate → BookDetail (201)
GET    /books/:id                 → BookDetail                          404
PATCH  /books/:id                 BookUpdate (+ expectedVersion) → BookDetail   409 stale_version
DELETE /books/:id                 204   (soft — appends a `deleted` version)
POST   /books/:id/restore         → BookDetail                          409 on live ASIN clash

GET    /books/:id/revisions       ListResponse<RevisionSummary>   ?actorId&changeKind&page&pageSize
GET    /books/:id/revisions/:v    → Revision (full snapshot)
GET    /books/:id/revisions/:v/diff?against=  → FieldDiff[]
POST   /books/:id/revert          { toVersion, note? } → BookDetail

GET    /books/:id/statuses        → UserBookStatus[]        (every member's row)
GET    /books/:id/me              → UserBookStatus | null
PATCH  /books/:id/me              { status?, rating?|null, startedAt?, finishedAt? } → UserBookStatus
DELETE /books/:id/me              204   (hard — removes the row entirely)
```

`?author=` joins `author_books` → `authors` on `lower(name)`, not an array
containment test — authors are their own rows. `authors` on `BookSummary`/
`BookDetail` is `{id, name}[]` in credited order.

`PATCH /books/:id` requires `expectedVersion`; a mismatch is a `409` carrying
`{reason: 'stale_version', currentVersion}`. Every field is `.optional()` with no
default — an absent key means "leave this alone," which is the whole point of a
patch (see the comment on `BookUpdateSchema` for why this can't be
`BookCreateSchema.partial()`).

`BookDetail` embeds `myStatus`, `statuses[]`, and `ratingSummary` so one request
paints the whole page; a soft-deleted book still returns `200` with `deletedAt` set,
rendering as a tombstone rather than a `404`. `BookDetail.statuses` entries are
`BookCommunityStatus` — `UserBookStatus` plus `username` — so the page can say
whose take each row is, unlike the bare `UserBookStatus[]` from
`GET /books/:id/statuses`.

## Series

```
GET    /series                    ListResponse<SeriesSummary>
         ?q&hasUpcoming&includeDeleted&sort=name|bookCount|nextRelease&dir&page&pageSize
POST   /series                    SeriesCreate → SeriesDetail (201)
GET    /series/:id                → SeriesDetail                       404
PATCH  /series/:id                SeriesUpdate (+ expectedVersion) → SeriesDetail   409 stale_version
DELETE /series/:id                204
POST   /series/:id/restore        → SeriesDetail

GET    /series/:id/books          ListResponse<BookSummary>   ?status&hasDate&sort=position|release|title&dir&page&pageSize
GET    /series/:id/revisions      ListResponse<RevisionSummary>
GET    /series/:id/revisions/:v   → Revision
GET    /series/:id/revisions/:v/diff?against=  → FieldDiff[]
POST   /series/:id/revert         { toVersion, note? } → SeriesDetail
```

Series names are **not unique** — two series may share a name. Deleting a series
does not touch its books' `seriesId`; while deleted, the join simply resolves to
nothing, and restoring is lossless. A revert never restores a deletion, for either
resource: `deletedAt`/`deletedBy` always come from the current row, not the target
snapshot.

## Authors

```
GET    /authors?q=                → Author[]     (name-prefix autocomplete)
```

## Releases

```
GET    /releases?from&to&includeUndated&mine&seriesId
       → { dated: BookSummary[], monthly: [...], yearly: [...], undated: [...], window }
```

Pre-bucketed by `releasePrecision` so the calendar and a "next 12 months" list
consume the identical payload. `mine=true` restricts to books the caller has marked
`plan` — "my upcoming releases," not every book in the window.

## Activity

```
GET    /activity?kind&actorId&bookId&before&limit(≤100)
       → { items: ActivityItem[], nextCursor: number | null }
```

Keyset-paginated on `id`, never offset — the feed is written to continuously, and
offset pagination is exactly where that duplicates or drops rows between pages. Pass
the previous response's `nextCursor` as `before` to get the next page; `nextCursor:
null` means there is no more. Each `ActivityItem` embeds a hydrated `actor` and
`book` so the feed renders with no follow-up request per row.

## Changes

```
GET    /changes?entityType&changeKind&actorId&entityId&since&page&pageSize
       → ListResponse<ChangeItem>
```

A union over `book_revisions` and `series_revisions`, one row per version, newest
first. `changedFields` is computed against the immediately preceding version so the
feed can say "3 fields changed" without shipping two full snapshots per row — the
full diff stays behind `/books/:id/revisions/:v/diff`.

## Trash

```
GET    /trash?type=book|series&q&deletedBy&sort=deletedAt|title&dir&page&pageSize
       → ListResponse<TrashItem>
```

A union over soft-deleted books and series, normalised to `{id, type, title,
deletedAt, deletedBy}`.

## Users

```
GET    /users                     ListResponse<UserSummary>   ?q&sort=name|bookCount|avgRating&dir&page&pageSize
GET    /users/:id                 → UserProfile   (+ statusCounts)
GET    /users/:id/shelf           ListResponse<ShelfEntry>   ?status&q&seriesId&sort=updated|title|rating|release&dir&page&pageSize
```

`bookCount`/`avgRating` are computed against `book_user_status`, not stored.
