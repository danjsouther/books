import { AppError, slugify, uniqueSlug } from '@books/domain';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { activity } from '../schema/activity';
import { books } from '../schema/books';
import { bookRevisions } from '../schema/revisions';
import { authorsOfBook, resolveAuthors, syncAuthorBooks, type AuthorRef } from './authors';
import { isUniqueSlugViolation } from './slug-constraint';
import {
  createWithRevision,
  LOCK_NAMESPACE,
  updateWithRevision,
  type Actor,
  type RevisionSpec,
  type Tx,
} from './with-revision';

export type Book = typeof books.$inferSelect;

/** A book row plus the things that live outside it. This, not the bare row, is what a
 *  revision snapshots — otherwise changing a book's authors would leave no trace in
 *  its history. */
export type BookSnapshot = Book & { authors: AuthorRef[] };

/** Every field a member may set. Audit and versioning columns are not in here —
 *  they are the mutation helper's business, not the caller's. */
export interface BookInput {
  title: string;
  subtitle: string | null;
  description: string | null;
  /** Names, in credited order. Resolved to `authors` rows on write. */
  authors: string[];
  seriesId: string | null;
  /** A decimal string: `1.5` is the universal novella convention, and `numeric`
   *  arrives as a string so exact ordering survives the round trip. */
  seriesPosition: string | null;
  /** `YYYY-MM-DD`, and always the earliest date consistent with the precision. */
  releaseDate: string | null;
  releasePrecision: (typeof books.releasePrecision.enumValues)[number];
  pageCount: number | null;
  asin: string | null;
  coverUrl: string | null;
  url: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/** A row, or a row that has been through jsonb — a stored snapshot comes back with its
 *  timestamps as ISO strings rather than `Date`s, and carries its authors inline. */
export type BookLike = Omit<Book, 'deletedAt'> & {
  deletedAt: Date | string | null;
  authors?: AuthorRef[];
};

export function bookInputFrom(row: BookLike): BookInput {
  return {
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    authors: (row.authors ?? []).map((a) => a.name),
    seriesId: row.seriesId,
    seriesPosition: row.seriesPosition,
    releaseDate: row.releaseDate,
    releasePrecision: row.releasePrecision,
    pageCount: row.pageCount,
    asin: row.asin,
    coverUrl: row.coverUrl,
    url: row.url,
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    deletedBy: row.deletedBy,
  };
}

/** The database columns of a book input — everything except the authors, which live in
 *  their own table and are written by `afterWrite`. */
function rowValues(input: BookInput) {
  const { authors: _authors, ...columns } = input;
  return columns;
}

const spec: RevisionSpec<Book, BookInput> = {
  label: 'book',
  lockNamespace: LOCK_NAMESPACE.books,

  // A book with no ASIN has no natural key, so there is nothing to serialise against —
  // two books without one can never collide.
  naturalKey: (input) => input.asin,

  async findLiveDuplicate(tx, input, excludeId) {
    if (input.asin === null || input.deletedAt !== null) return undefined;
    const where = and(
      eq(books.asin, input.asin),
      isNull(books.deletedAt),
      excludeId === null ? undefined : ne(books.id, excludeId),
    );
    const [row] = await tx.select({ id: books.id }).from(books).where(where).limit(1);
    return row?.id;
  },

  duplicateMessage: (input) => `A book with ASIN ${input.asin ?? ''} already exists.`,

  async load(tx, id, forUpdate) {
    const query = tx.select().from(books).where(eq(books.id, id)).limit(1);
    const [row] = await (forUpdate ? query.for('update') : query);
    return row;
  },

  async insert(tx, input, actorId) {
    const base = slugify(input.title);
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const slug = await uniqueSlug(base, async (candidate) => {
        const [existing] = await tx
          .select({ id: books.id })
          .from(books)
          .where(eq(books.slug, candidate))
          .limit(1);
        return existing !== undefined;
      });
      try {
        // A savepoint, not the bare insert: on a unique-slug conflict this must
        // roll back only this attempt, not poison the whole outer transaction —
        // Postgres aborts every later statement in a transaction once one fails.
        return await tx.transaction(async (savepointTx) => {
          const [row] = await savepointTx
            .insert(books)
            .values({
              ...rowValues(input),
              slug,
              version: 1,
              createdBy: actorId,
              updatedBy: actorId,
            })
            .returning();
          if (row === undefined) throw new AppError('internal_error', 'Insert returned no row.');
          return row;
        });
      } catch (error) {
        if (attempt === MAX_ATTEMPTS || !isUniqueSlugViolation(error, 'books_slug_key'))
          throw error;
      }
    }
    throw new AppError('internal_error', 'Could not generate a unique slug.');
  },

  async update(tx, id, input, version, actorId) {
    const [row] = await tx
      .update(books)
      .set({ ...rowValues(input), version, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Update returned no row.');
    return row;
  },

  // Authors are settled before the snapshot is taken, so the revision records the
  // author set as it stands after this change.
  async afterWrite(tx, row, input) {
    const resolved = await resolveAuthors(tx, input.authors);
    await syncAuthorBooks(tx, row.id, resolved);
  },

  async appendRevision(tx, row, changeKind, actorId, note) {
    const snapshot: BookSnapshot = { ...row, authors: await authorsOfBook(tx, row.id) };
    await tx.insert(bookRevisions).values({
      bookId: row.id,
      version: row.version,
      snapshot,
      changeKind,
      changedBy: actorId,
      note,
    });
  },

  async onCreated(tx, row, actorId) {
    await tx.insert(activity).values({ kind: 'book.added', actorId, bookId: row.id, payload: {} });
  },
};

/** The current state as a mutation input, authors included. Every update path starts
 *  from this, so a patch that says nothing about authors leaves them alone. */
async function currentInput(tx: Tx, current: Book): Promise<BookInput> {
  return bookInputFrom({ ...current, authors: await authorsOfBook(tx, current.id) });
}

export function createBook(db: Db, input: BookInput, actor: Actor): Promise<Book> {
  return createWithRevision(db, spec, input, actor);
}

export function updateBook(
  db: Db,
  id: string,
  patch: Partial<BookInput>,
  actor: Actor,
  expectedVersion?: number,
): Promise<Book> {
  return updateWithRevision(
    db,
    spec,
    id,
    'edited',
    async (current, tx) => ({ ...(await currentInput(tx, current)), ...patch }),
    actor,
    expectedVersion === undefined ? {} : { expectedVersion },
  );
}

/** Soft. Appends a `deleted` revision and bumps the version, which is precisely what
 *  makes the ASIN immediately reusable — see `docs/data-model.md`. */
export function deleteBook(
  db: Db,
  id: string,
  actor: Actor,
  expectedVersion?: number,
): Promise<Book> {
  return updateWithRevision(
    db,
    spec,
    id,
    'deleted',
    async (current, tx) => ({
      ...(await currentInput(tx, current)),
      deletedAt: new Date(),
      deletedBy: actor.id,
    }),
    actor,
    expectedVersion === undefined ? {} : { expectedVersion },
  );
}

export function restoreBook(db: Db, id: string, actor: Actor): Promise<Book> {
  return updateWithRevision(
    db,
    spec,
    id,
    'restored',
    async (current, tx) => ({
      ...(await currentInput(tx, current)),
      deletedAt: null,
      deletedBy: null,
    }),
    actor,
  );
}

/**
 * Forward-only. Reverting writes a *new* version whose content equals the target's,
 * rather than truncating history — so reverting a revert works, and nothing is lost.
 *
 * A revert never restores a deletion: `deletedAt`/`deletedBy` are taken from the
 * current row, not the snapshot. Delete and restore are explicit operations, and a
 * button labelled "Restore this version" must never trash the record.
 */
export async function revertBook(
  db: Db,
  id: string,
  toVersion: number,
  actor: Actor,
  note: string | null = null,
): Promise<Book> {
  const [revision] = await db
    .select({ snapshot: bookRevisions.snapshot })
    .from(bookRevisions)
    .where(and(eq(bookRevisions.bookId, id), eq(bookRevisions.version, toVersion)))
    .limit(1);
  if (revision === undefined) {
    throw new AppError('not_found', `This book has no version ${String(toVersion)}.`);
  }
  const target = bookInputFrom(revision.snapshot as BookLike);

  return updateWithRevision(
    db,
    spec,
    id,
    'reverted',
    (current) => ({ ...target, deletedAt: current.deletedAt, deletedBy: current.deletedBy }),
    actor,
    { note },
  );
}

/** True when the id refers to a live book. Only for assertions and tests — real reads
 *  go through the `activeBooks()` builder. */
export async function bookExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(books)
    .where(and(eq(books.id, id), isNull(books.deletedAt)))
    .limit(1);
  return row !== undefined;
}
