import { sql } from 'drizzle-orm';
import { index, inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tokenClient } from './enums';
import { users } from './users';

/**
 * OAuth state is held server-side rather than in a signed cookie because the
 * desktop client has no cookie jar, and one code path beats two. Consumed
 * atomically with `DELETE ... RETURNING *`, so a replayed state cannot succeed.
 */
export const oauthStates = pgTable('oauth_states', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  /** Always validated as a relative path before use — open redirect is the
   *  number-one bug in hand-rolled OAuth. */
  redirectTo: text('redirect_to'),
  client: tokenClient('client').notNull().default('web'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * Opaque 32-byte random values, stored only as a SHA-256 hash. They are already
 * high-entropy, so a slow KDF would add latency to every refresh and buy nothing
 * — this is the standard exception to "always bcrypt".
 *
 * Rotating, with family reuse detection: presenting an already-revoked token
 * revokes the entire `familyId`.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    parentId: uuid('parent_id'),
    client: tokenClient('client').notNull().default('web'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (t) => [
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

/**
 * Unused in v1. Three columns of foresight that make "give the desktop client a
 * long-lived token" additive rather than a migration.
 */
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  subjectType: tokenClient('subject_type').notNull().default('service'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  scopes: text('scopes')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
