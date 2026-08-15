import { AppError } from '@books/domain';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { activity } from '../schema/activity';
import { books } from '../schema/books';
import { bookRevisions } from '../schema/revisions';
import {
  createWithRevision,
  LOCK_NAMESPACE,
  updateWithRevision,
  type Actor,
  type RevisionSpec,
} from './with-revision';

export type Book = typeof books.$inferSelect;

/** Every field a member may set. Audit and versioning columns are not in here —
 *  they are the mutation helper's business, not the caller's. */
export interface BookInput {
  title: string;
  subtitle: string | null;
  description: string | null;
  authors: string[];
  seriesId: string | null;
  /** A decimal string: `1.5` is the universal novella convention, and `numeric`
   *  arrives as a string so exact ordering survives the round trip. */
  seriesPosition: string | null;
  /** `YYYY-MM-DD`, and always the earliest date consistent with the precision. */
  releaseDate: string | null;
  releasePrecision: (typeof books.releasePrecision.enumValues)[number];
  pageCount: number | null;
  isbn13: string | null;
  coverUrl: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/** A row, or a row that has been through jsonb — a stored snapshot comes back
 *  with its timestamps as ISO strings rather than `Date`s. */
export type BookLike = Omit<Book, 'deletedAt'> & { deletedAt: Date | string | null };

export function bookInputFrom(row: BookLike): BookInput {
  return {
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    authors: [...row.authors],
    seriesId: row.seriesId,
    seriesPosition: row.seriesPosition,
    releaseDate: row.releaseDate,
    releasePrecision: row.releasePrecision,
    pageCount: row.pageCount,
    isbn13: row.isbn13,
    coverUrl: row.coverUrl,
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    deletedBy: row.deletedBy,
  };
}

const spec: RevisionSpec<Book, BookInput> = {
  label: 'book',
  lockNamespace: LOCK_NAMESPACE.books,

  // A book with no ISBN has no natural key, so there is nothing to serialise
  // against — two untitled-ISBN books can never collide.
  naturalKey: (input) => input.isbn13,

  async findLiveDuplicate(tx, input, excludeId) {
    if (input.isbn13 === null || input.deletedAt !== null) return undefined;
    const where = and(
      eq(books.isbn13, input.isbn13),
      isNull(books.deletedAt),
      excludeId === null ? undefined : ne(books.id, excludeId),
    );
    const [row] = await tx.select({ id: books.id }).from(books).where(where).limit(1);
    return row?.id;
  },

  duplicateMessage: (input) => `A book with ISBN ${input.isbn13 ?? ''} already exists.`,

  async load(tx, id) {
    const [row] = await tx.select().from(books).where(eq(books.id, id)).limit(1);
    return row;
  },

  async insert(tx, input, actorId) {
    const [row] = await tx
      .insert(books)
      .values({ ...input, version: 1, createdBy: actorId, updatedBy: actorId })
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Insert returned no row.');
    return row;
  },

  async update(tx, id, input, version, actorId) {
    const [row] = await tx
      .update(books)
      .set({ ...input, version, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Update returned no row.');
    return row;
  },

  async appendRevision(tx, row, changeKind, actorId, note) {
    await tx.insert(bookRevisions).values({
      bookId: row.id,
      version: row.version,
      snapshot: row,
      changeKind,
      changedBy: actorId,
      note,
    });
  },

  async onCreated(tx, row, actorId) {
    await tx.insert(activity).values({ kind: 'book.added', actorId, bookId: row.id, payload: {} });
  },
};

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
    (current) => ({ ...bookInputFrom(current), ...patch }),
    actor,
    expectedVersion === undefined ? {} : { expectedVersion },
  );
}

/** Soft. Appends a `deleted` revision and bumps the version, which is precisely
 *  what makes the name immediately reusable — see `docs/data-model.md`. */
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
    (current) => ({ ...bookInputFrom(current), deletedAt: new Date(), deletedBy: actor.id }),
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
    (current) => ({ ...bookInputFrom(current), deletedAt: null, deletedBy: null }),
    actor,
  );
}

/**
 * Forward-only. Reverting writes a *new* version whose content equals the
 * target's, rather than truncating history — so reverting a revert works, and
 * nothing is ever lost.
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

  return updateWithRevision(db, spec, id, 'reverted', () => target, actor, { note });
}

/** True when the id refers to a live book. Only for assertions and tests — real
 *  reads go through the `activeBooks()` builder. */
export async function bookExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(books)
    .where(and(eq(books.id, id), isNull(books.deletedAt)))
    .limit(1);
  return row !== undefined;
}
