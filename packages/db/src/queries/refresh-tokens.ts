import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client';
import { refreshTokens } from '../schema/auth';

export type RefreshToken = typeof refreshTokens.$inferSelect;

export interface NewRefreshToken {
  readonly tokenHash: string;
  readonly userId: string;
  readonly familyId: string;
  readonly parentId: string | null;
  readonly client: 'web' | 'desktop' | 'service';
  readonly expiresAt: Date;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export async function issueRefreshToken(db: Db, input: NewRefreshToken): Promise<RefreshToken> {
  const [row] = await db.insert(refreshTokens).values(input).returning();
  if (row === undefined) throw new Error('Insert returned no row.');
  return row;
}

export async function findRefreshTokenByHash(
  db: Db,
  tokenHash: string,
): Promise<RefreshToken | undefined> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  return row;
}

export async function revokeRefreshToken(db: Db, id: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, id));
}

/** Reuse of an already-revoked token means the token was stolen — the entire
 *  rotation chain is compromised, not just the one presented, so every unrevoked
 *  token in the family is revoked at once. */
export async function revokeRefreshTokenFamily(db: Db, familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
