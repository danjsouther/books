import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }
  return url;
}

/**
 * Callers own the pool and are responsible for closing it — the server closes it
 * on SIGTERM, a test closes it in `afterAll`. Returning both keeps that explicit
 * rather than hiding a process-lifetime singleton in a module.
 */
export function createDb(connectionString = databaseUrl()): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}
