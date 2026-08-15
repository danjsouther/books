import { AppError, staleVersion } from '@books/domain';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type ChangeKind = 'created' | 'edited' | 'deleted' | 'restored' | 'reverted';

/** The minimum every versioned catalog record has. */
export interface VersionedRow {
  readonly id: string;
  readonly version: number;
  readonly deletedAt: Date | null;
}

/**
 * Namespaces the advisory lock so a second natural key could never hash into the same
 * lock as a book's ASIN. Only books have one: series names are deliberately not
 * unique, so there is nothing to serialise on that side.
 */
export const LOCK_NAMESPACE = { books: 2 } as const;

export interface RevisionSpec<TRow extends VersionedRow, TInput> {
  /** Used in user-facing messages: "this book was changed by someone else". */
  readonly label: string;
  readonly lockNamespace?: number;

  /** The natural key to lock on, or null when this record has none. Omit entirely for
   *  an entity with no uniqueness rule at all — the lock and the duplicate check below
   *  are then both skipped. */
  naturalKey?(input: TInput): string | null;
  /** Returns the id of a *live* record that would collide, ignoring `excludeId`. */
  findLiveDuplicate?(tx: Tx, input: TInput, excludeId: string | null): Promise<string | undefined>;
  duplicateMessage?(input: TInput): string;

  load(tx: Tx, id: string, forUpdate: boolean): Promise<TRow | undefined>;
  insert(tx: Tx, input: TInput, actorId: string | null): Promise<TRow>;
  update(tx: Tx, id: string, input: TInput, version: number, actorId: string | null): Promise<TRow>;
  /** Runs after the row is written and before the revision is appended, so anything
   *  living outside the row — a book's authors — is in its final state by the time the
   *  snapshot is taken. */
  afterWrite?(tx: Tx, row: TRow, input: TInput): Promise<void>;
  appendRevision(
    tx: Tx,
    row: TRow,
    changeKind: ChangeKind,
    actorId: string | null,
    note: string | null,
  ): Promise<void>;
  /** Runs inside the same transaction after a `created` revision, so the activity
   *  feed can never disagree with the catalog. */
  onCreated?(tx: Tx, row: TRow, actorId: string | null): Promise<void>;
}

/**
 * Takes the advisory lock on a natural key for the rest of the transaction. Two
 * concurrent creates of the same key therefore serialise: the second one waits, then
 * sees the first one's row in the duplicate check below and fails cleanly instead of
 * both passing the check and both inserting.
 */
async function lockNaturalKey<TRow extends VersionedRow, TInput>(
  tx: Tx,
  spec: RevisionSpec<TRow, TInput>,
  input: TInput,
): Promise<void> {
  const key = spec.naturalKey?.(input) ?? null;
  if (key === null || spec.lockNamespace === undefined) return;
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${spec.lockNamespace}, hashtext(${key.toLowerCase()}))`,
  );
}

async function assertNoLiveDuplicate<TRow extends VersionedRow, TInput>(
  tx: Tx,
  spec: RevisionSpec<TRow, TInput>,
  input: TInput,
  excludeId: string | null,
): Promise<void> {
  if (spec.findLiveDuplicate === undefined) return;
  const clash = await spec.findLiveDuplicate(tx, input, excludeId);
  if (clash !== undefined) {
    const message = spec.duplicateMessage?.(input) ?? `That ${spec.label} already exists.`;
    throw new AppError('conflict', message, { reason: 'duplicate' });
  }
}

async function loadOrThrow<TRow extends VersionedRow, TInput>(
  tx: Tx,
  spec: RevisionSpec<TRow, TInput>,
  id: string,
  forUpdate: boolean,
): Promise<TRow> {
  const row = await spec.load(tx, id, forUpdate);
  if (row === undefined) {
    throw new AppError('not_found', `No such ${spec.label}.`);
  }
  return row;
}

/**
 * `version` is the optimistic-concurrency token as well as the revision number, so a
 * save carrying a stale one is rejected rather than silently clobbering a concurrent
 * edit.
 */
function assertVersion(label: string, current: number, expected: number | undefined): void {
  if (expected !== undefined && expected !== current) {
    throw staleVersion(label, current);
  }
}

export interface Actor {
  readonly id: string | null;
}

/**
 * Creates a record at version 1, snapshots it, and lets the spec record the social
 * half of the event.
 *
 * Everything below runs in one transaction, which is the whole point: the current row,
 * its revision history, and the activity feed are consistent by construction rather
 * than by discipline.
 */
export async function createWithRevision<TRow extends VersionedRow, TInput>(
  db: Db,
  spec: RevisionSpec<TRow, TInput>,
  input: TInput,
  actor: Actor,
  note: string | null = null,
): Promise<TRow> {
  return db.transaction(async (tx) => {
    await lockNaturalKey(tx, spec, input);
    await assertNoLiveDuplicate(tx, spec, input, null);

    const row = await spec.insert(tx, input, actor.id);
    await spec.afterWrite?.(tx, row, input);
    await spec.appendRevision(tx, row, 'created', actor.id, note);
    await spec.onCreated?.(tx, row, actor.id);
    return row;
  });
}

/**
 * The single path for every change to an existing record — edits, deletions,
 * restorations, and reverts alike. Deletion is not a special case: it is a mutation
 * that happens to set `deletedAt`, which is what makes the full sequence of deletions
 * and restorations survive in history for free.
 */
export async function updateWithRevision<TRow extends VersionedRow, TInput>(
  db: Db,
  spec: RevisionSpec<TRow, TInput>,
  id: string,
  changeKind: Exclude<ChangeKind, 'created'>,
  /** Receives the transaction as well as the row, because an entity whose state
   *  extends beyond its row — a book's authors — has to read that state here or a
   *  patch that says nothing about it would silently clear it. */
  toInput: (current: TRow, tx: Tx) => TInput | Promise<TInput>,
  actor: Actor,
  options: { expectedVersion?: number; note?: string | null } = {},
): Promise<TRow> {
  return db.transaction(async (tx) => {
    // FOR UPDATE, so the version read here cannot be stale by the time it is written.
    // Without it two concurrent edits both read version 1, both write 2, and both
    // insert the same revision key — the loser gets a raw primary-key violation
    // instead of a clean conflict, and with no expectedVersion supplied one edit is
    // silently lost.
    const current = await loadOrThrow(tx, spec, id, true);
    assertVersion(spec.label, current.version, options.expectedVersion);

    const input = await toInput(current, tx);
    await lockNaturalKey(tx, spec, input);

    // A deletion cannot collide with anything, so it skips the check — but a restore
    // very much can, if someone reused the key while this sat in the trash. That is a
    // legitimate 409 rather than a reason to allow two live records with one key.
    if (changeKind !== 'deleted') {
      await assertNoLiveDuplicate(tx, spec, input, id);
    }

    const row = await spec.update(tx, id, input, current.version + 1, actor.id);
    await spec.afterWrite?.(tx, row, input);
    await spec.appendRevision(tx, row, changeKind, actor.id, options.note ?? null);
    return row;
  });
}
