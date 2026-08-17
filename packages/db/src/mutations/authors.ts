import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { authorBooks } from '../schema/author-books';
import { authors } from '../schema/authors';
import { tokenizedMatch } from '../lib/text-search';
import type { Tx } from './with-revision';

export type Author = typeof authors.$inferSelect;

/** An author as it appears inside a book revision snapshot. */
export interface AuthorRef {
  readonly id: string;
  readonly name: string;
}

/** Trims, and drops blanks — an empty name is not an author. Order is preserved and
 *  duplicates within one book are collapsed, since a book cannot credit the same
 *  person twice. */
export function normalizeAuthorNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === '') continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Maps names to author rows, creating the ones that do not exist yet.
 *
 * Read-optimised: the overwhelmingly common case is that every author is already
 * known, which costs one query. New names are inserted with `ON CONFLICT DO NOTHING`
 * and then re-selected, so two transactions resolving the same new name concurrently
 * produce one row rather than an error — the unique index arbitrates and the re-select
 * picks up whichever one won.
 */
export async function resolveAuthors(tx: Tx, names: readonly string[]): Promise<AuthorRef[]> {
  const wanted = normalizeAuthorNames(names);
  if (wanted.length === 0) return [];

  const byLower = new Map<string, AuthorRef>();
  const lookup = async (): Promise<void> => {
    const keys = wanted.map((n) => n.toLowerCase());
    const found = await tx
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .where(inArray(sql`lower(${authors.name})`, keys));
    for (const row of found) byLower.set(row.name.toLowerCase(), row);
  };

  await lookup();

  const missing = wanted.filter((n) => !byLower.has(n.toLowerCase()));
  if (missing.length > 0) {
    await tx
      .insert(authors)
      .values(missing.map((name) => ({ name })))
      .onConflictDoNothing();
    await lookup();
  }

  // Preserve the caller's order — it is the credited order.
  return wanted.flatMap((name) => {
    const row = byLower.get(name.toLowerCase());
    return row === undefined ? [] : [row];
  });
}

/**
 * Brings `author_books` into line with the given ordered author list, writing only the
 * difference. `position` is rewritten from the input order, so reordering the same
 * authors is a real change even though membership did not move.
 */
export async function syncAuthorBooks(
  tx: Tx,
  bookId: string,
  resolved: readonly AuthorRef[],
): Promise<void> {
  const existing = await tx
    .select({ authorId: authorBooks.authorId, position: authorBooks.position })
    .from(authorBooks)
    .where(eq(authorBooks.bookId, bookId));

  const wantedIds = resolved.map((a) => a.id);
  const wantedPosition = new Map(wantedIds.map((id, i) => [id, i]));
  const existingPosition = new Map(existing.map((row) => [row.authorId, row.position]));

  const removed = existing.filter((row) => !wantedPosition.has(row.authorId));
  if (removed.length > 0) {
    await tx.delete(authorBooks).where(
      and(
        eq(authorBooks.bookId, bookId),
        inArray(
          authorBooks.authorId,
          removed.map((row) => row.authorId),
        ),
      ),
    );
  }

  const added = resolved.filter((a) => !existingPosition.has(a.id));
  if (added.length > 0) {
    await tx.insert(authorBooks).values(
      added.map((a) => ({
        bookId,
        authorId: a.id,
        position: wantedPosition.get(a.id) ?? 0,
      })),
    );
  }

  for (const a of resolved) {
    const before = existingPosition.get(a.id);
    const after = wantedPosition.get(a.id) ?? 0;
    if (before !== undefined && before !== after) {
      await tx
        .update(authorBooks)
        .set({ position: after })
        .where(and(eq(authorBooks.bookId, bookId), eq(authorBooks.authorId, a.id)));
    }
  }
}

/** A book's authors in credited order. Used to build the revision snapshot, and by
 *  every read that needs to render a book. */
export async function authorsOfBook(tx: Tx | Db, bookId: string): Promise<AuthorRef[]> {
  return tx
    .select({ id: authors.id, name: authors.name })
    .from(authorBooks)
    .innerJoin(authors, eq(authors.id, authorBooks.authorId))
    .where(eq(authorBooks.bookId, bookId))
    .orderBy(asc(authorBooks.position));
}

/**
 * Token lookup for author autocomplete. Was a name *prefix* match, which is the
 * one thing an author search must not be: "sanderson" found nothing, because
 * every stored name starts with a given name. Every other `q` filter in this
 * package shares `tokenizedMatch` now, so "brandon sanderson" and "sanderson
 * brandon" both land too.
 */
export async function listAuthors(db: Db, query: string, limit = 20): Promise<Author[]> {
  const match = tokenizedMatch(authors.name, query);
  const rows = db.select().from(authors);
  if (match === undefined) return rows.orderBy(asc(authors.name)).limit(limit);
  return rows.where(match).orderBy(asc(authors.name)).limit(limit);
}
