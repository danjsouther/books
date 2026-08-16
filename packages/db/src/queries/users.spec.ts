import { schema, type Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findUserByDiscordId } from './users';

const { users } = schema;

describe.skipIf(!hasDatabase)('findUserByDiscordId', () => {
  let db: Db;
  let pool: Pool;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('finds a user by their Discord id', async () => {
    await db.insert(users).values({ discordId: 'discord-123', username: 'alice' });

    const found = await findUserByDiscordId(db, 'discord-123');
    expect(found?.username).toBe('alice');
  });

  it('returns undefined for an unknown Discord id', async () => {
    const found = await findUserByDiscordId(db, 'nobody-here');
    expect(found).toBeUndefined();
  });
});
