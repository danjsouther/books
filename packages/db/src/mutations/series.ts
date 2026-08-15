import { AppError } from '@books/domain';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { series } from '../schema/series';
import { seriesRevisions } from '../schema/revisions';
import {
  createWithRevision,
  LOCK_NAMESPACE,
  updateWithRevision,
  type Actor,
  type RevisionSpec,
} from './with-revision';

export type Series = typeof series.$inferSelect;

export interface SeriesInput {
  name: string;
  sortName: string | null;
  description: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/** A row, or a row that has been through jsonb — a stored snapshot comes back
 *  with its timestamps as ISO strings rather than `Date`s. */
export type SeriesLike = Omit<Series, 'deletedAt'> & { deletedAt: Date | string | null };

export function seriesInputFrom(row: SeriesLike): SeriesInput {
  return {
    name: row.name,
    sortName: row.sortName,
    description: row.description,
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    deletedBy: row.deletedBy,
  };
}

const spec: RevisionSpec<Series, SeriesInput> = {
  label: 'series',
  lockNamespace: LOCK_NAMESPACE.series,

  naturalKey: (input) => input.name,

  async findLiveDuplicate(tx, input, excludeId) {
    if (input.deletedAt !== null) return undefined;
    const where = and(
      eq(series.nameLower, input.name.toLowerCase()),
      isNull(series.deletedAt),
      excludeId === null ? undefined : ne(series.id, excludeId),
    );
    const [row] = await tx.select({ id: series.id }).from(series).where(where).limit(1);
    return row?.id;
  },

  // The good error message comes from here, not from a constraint violation —
  // users should never see raw SQL text.
  duplicateMessage: (input) => `A series named ${input.name} already exists.`,

  async load(tx, id) {
    const [row] = await tx.select().from(series).where(eq(series.id, id)).limit(1);
    return row;
  },

  async insert(tx, input, actorId) {
    const [row] = await tx
      .insert(series)
      .values({ ...input, version: 1, createdBy: actorId, updatedBy: actorId })
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Insert returned no row.');
    return row;
  },

  async update(tx, id, input, version, actorId) {
    const [row] = await tx
      .update(series)
      .set({ ...input, version, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(series.id, id))
      .returning();
    if (row === undefined) throw new AppError('internal_error', 'Update returned no row.');
    return row;
  },

  async appendRevision(tx, row, changeKind, actorId, note) {
    await tx.insert(seriesRevisions).values({
      seriesId: row.id,
      version: row.version,
      snapshot: row,
      changeKind,
      changedBy: actorId,
      note,
    });
  },
};

export function createSeries(db: Db, input: SeriesInput, actor: Actor): Promise<Series> {
  return createWithRevision(db, spec, input, actor);
}

export function updateSeries(
  db: Db,
  id: string,
  patch: Partial<SeriesInput>,
  actor: Actor,
  expectedVersion?: number,
): Promise<Series> {
  return updateWithRevision(
    db,
    spec,
    id,
    'edited',
    (current) => ({ ...seriesInputFrom(current), ...patch }),
    actor,
    expectedVersion === undefined ? {} : { expectedVersion },
  );
}

/**
 * Deleting a series deliberately does not touch its books. `books.series_id`
 * stays intact so a restore is lossless; while the series is deleted the join
 * resolves to nothing and its books simply render as unattached. That is a real
 * advantage over `ON DELETE SET NULL`, which loses the association for good.
 */
export function deleteSeries(
  db: Db,
  id: string,
  actor: Actor,
  expectedVersion?: number,
): Promise<Series> {
  return updateWithRevision(
    db,
    spec,
    id,
    'deleted',
    (current) => ({ ...seriesInputFrom(current), deletedAt: new Date(), deletedBy: actor.id }),
    actor,
    expectedVersion === undefined ? {} : { expectedVersion },
  );
}

/** Can legitimately fail: if someone reused the name while this sat in the trash,
 *  restoring it is a 409 rather than a second live series with the same name. */
export function restoreSeries(db: Db, id: string, actor: Actor): Promise<Series> {
  return updateWithRevision(
    db,
    spec,
    id,
    'restored',
    (current) => ({ ...seriesInputFrom(current), deletedAt: null, deletedBy: null }),
    actor,
  );
}

export async function revertSeries(
  db: Db,
  id: string,
  toVersion: number,
  actor: Actor,
  note: string | null = null,
): Promise<Series> {
  const [revision] = await db
    .select({ snapshot: seriesRevisions.snapshot })
    .from(seriesRevisions)
    .where(and(eq(seriesRevisions.seriesId, id), eq(seriesRevisions.version, toVersion)))
    .limit(1);
  if (revision === undefined) {
    throw new AppError('not_found', `This series has no version ${String(toVersion)}.`);
  }
  const target = seriesInputFrom(revision.snapshot as SeriesLike);

  return updateWithRevision(db, spec, id, 'reverted', () => target, actor, { note });
}

export async function seriesExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(series)
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .limit(1);
  return row !== undefined;
}
