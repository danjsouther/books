import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { oauthStates } from '../schema/auth';

export type OauthState = typeof oauthStates.$inferSelect;

export interface NewOauthState {
  readonly state: string;
  readonly codeVerifier: string;
  readonly redirectTo: string | null;
  readonly client: 'web' | 'desktop' | 'service';
  readonly expiresAt: Date;
}

export async function insertOauthState(db: Db, input: NewOauthState): Promise<void> {
  await db.insert(oauthStates).values(input);
}

/**
 * Atomic single-use consumption: the row is gone the instant it is read, so a
 * replayed `state` — the same callback URL hit twice — can succeed at most once.
 * A row past its `expiresAt` is still consumed (so it cannot be reused later) but
 * reported as absent to the caller.
 */
export async function consumeOauthState(db: Db, state: string): Promise<OauthState | undefined> {
  const [row] = await db.delete(oauthStates).where(eq(oauthStates.state, state)).returning();
  if (row === undefined) return undefined;
  return row.expiresAt.getTime() > Date.now() ? row : undefined;
}
