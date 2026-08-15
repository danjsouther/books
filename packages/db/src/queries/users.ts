import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { users } from '../schema/users';

export type User = typeof users.$inferSelect;

export interface DiscordProfile {
  readonly discordId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarHash: string | null;
}

/**
 * `users` is not a versioned catalog record — no revision history, no soft delete.
 * Login is the only writer, so a plain upsert on `discord_id` is all it needs.
 */
export async function upsertUserFromDiscord(db: Db, profile: DiscordProfile): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ ...profile, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: users.discordId,
      set: {
        username: profile.username,
        displayName: profile.displayName,
        avatarHash: profile.avatarHash,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (row === undefined) throw new Error('Upsert returned no row.');
  return row;
}

export async function findUserById(db: Db, id: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}
