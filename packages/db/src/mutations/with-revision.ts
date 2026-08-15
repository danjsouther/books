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
 * Lock namespaces, so a book's ISBN and a series' name can never hash into the
 * same advisory lock.
 */
export const LOCK_NAMESPACE = { series: 1, books: 2 } as const;

export interface RevisionSpec<TRow extends VersionedRow, TInput> {
  /** Used in user-facing messages: "this book was changed by someone else". */
  readonly label: string;
  readonly lockNamespace: number;

  /** The natural key to lock on, or null when the record has none (a book with
   *  no ISBN cannot collide with anything, so there is nothing to serialise). */
  naturalKey(input: TInput): string | null;
  /** Returns the id of a *live* record that would collide, ignoring `excludeId`. */
  findLiveDuplicate(tx: Tx, input: TInput, excludeId: string | null): Promise<string | undefined>;
  duplicateMessage(input: TInput): string;

  load(tx: Tx, id: string): Promise<TRow | undefined>;
  insert(tx: Tx, input: TInput, actorId: string | null): Promise<TRow>;
  update(tx: Tx, id: string, input: TInput, version: number, actorId: string | null): Promise<TRow>;
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
 * concurrent creates of the same name therefore serialise: the second one waits,
 * then sees the first one's row in the duplicate check below and fails cleanly
 * instead of both passing the check and both inserting.
 */
async function lockNaturalKey(tx: Tx, namespace: number, key: string | null): Promise<void> {
  if (key === null) return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${namespace}, hashtext(${key.toLowerCase()}))`);
}

async function assertNoLiveDuplicate<TRow extends VersionedRow, TInput>(
  tx: Tx,
  spec: RevisionSpec<TRow, TInput>,
  input: TInput,
  excludeId: string | null,
): Promise<void> {
  const clash = await spec.findLiveDuplicate(tx, input, excludeId);
  if (clash !== undefined) {
    throw new AppError('conflict', spec.duplicateMessage(input), { reason: 'duplicate' });
  }
}

async function loadOrThrow<TRow extends VersionedRow, TInput>(
  tx: Tx,
  spec: RevisionSpec<TRow, TInput>,
  id: string,
): Promise<TRow> {
  const row = await spec.load(tx, id);
  if (row === undefined) {
    throw new AppError('not_found', `No such ${spec.label}.`);
  }
  return row;
}

/**
 * `version` is the optimistic-concurrency token as well as the revision number,
 * so a save carrying a stale one is rejected rather than silently clobbering a
 * concurrent edit.
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
 * Creates a record at version 1, snapshots it, and lets the spec record the
 * social half of the event.
 *
 * Everything below runs in one transaction, which is the whole point: the current
 * row, its revision history, and the activity feed are consistent by
 * construction rather than by discipline.
 */
export async function createWithRevision<TRow extends VersionedRow, TInput>(
  db: Db,
  spec: RevisionSpec<TRow, TInput>,
  input: TInput,
  actor: Actor,
  note: string | null = null,
): Promise<TRow> {
  return db.transaction(async (tx) => {
    await lockNaturalKey(tx, spec.lockNamespace, spec.naturalKey(input));
    await assertNoLiveDuplicate(tx, spec, input, null);

    const row = await spec.insert(tx, input, actor.id);
    await spec.appendRevision(tx, row, 'created', actor.id, note);
    await spec.onCreated?.(tx, row, actor.id);
    return row;
  });
}

/**
 * The single path for every change to an existing record — edits, deletions,
 * restorations, and reverts alike. Deletion is not a special case: it is a
 * mutation that happens to set `deletedAt`, which is what makes the full sequence
 * of deletions and restorations survive in history for free.
 */
export async function updateWithRevision<TRow extends VersionedRow, TInput>(
  db: Db,
  spec: RevisionSpec<TRow, TInput>,
  id: string,
  changeKind: Exclude<ChangeKind, 'created'>,
  toInput: (current: TRow) => TInput,
  actor: Actor,
  options: { expectedVersion?: number; note?: string | null } = {},
): Promise<TRow> {
  return db.transaction(async (tx) => {
    const current = await loadOrThrow(tx, spec, id);
    assertVersion(spec.label, current.version, options.expectedVersion);

    const input = toInput(current);
    await lockNaturalKey(tx, spec.lockNamespace, spec.naturalKey(input));

    // A deletion cannot collide with anything, so it skips the check — but a
    // restore very much can, if someone reused the name while this sat in the
    // trash. That is a legitimate 409 rather than a reason to allow two live
    // records with the same name.
    if (changeKind !== 'deleted') {
      await assertNoLiveDuplicate(tx, spec, input, id);
    }

    const row = await spec.update(tx, id, input, current.version + 1, actor.id);
    await spec.appendRevision(tx, row, changeKind, actor.id, options.note ?? null);
    return row;
  });
}
