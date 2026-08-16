import { AppError } from '@books/domain';
import {
  findRefreshTokenByHash,
  issueRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  type Db,
} from '@books/db';
import { randomUUID } from 'node:crypto';
import type { AuthConfig } from '../types';
import {
  generateCsrfToken,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  type Client,
} from './tokens';

export interface SessionMeta {
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly expiresIn: number;
  readonly client: Client;
}

async function mintTokenPair(
  db: Db,
  auth: AuthConfig,
  userId: string,
  client: Client,
  familyId: string,
  parentId: string | null,
  meta: SessionMeta,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + auth.refreshTtlSeconds * 1000);

  await issueRefreshToken(db, {
    tokenHash: hashRefreshToken(refreshToken),
    userId,
    familyId,
    parentId,
    client,
    expiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const accessToken = await signAccessToken(userId, client, auth.jwtSecret, auth.accessTtlSeconds);

  return {
    accessToken,
    refreshToken,
    csrfToken: generateCsrfToken(),
    expiresIn: auth.accessTtlSeconds,
    client,
  };
}

/** A fresh login: a brand new rotation family. */
export function issueSession(
  db: Db,
  auth: AuthConfig,
  userId: string,
  client: Client,
  meta: SessionMeta,
): Promise<IssuedSession> {
  return mintTokenPair(db, auth, userId, client, randomUUID(), null, meta);
}

/**
 * Rotates a refresh token: the presented one is revoked and a new one issued in
 * the same family. Presenting a token that is *already* revoked means the chain
 * has been compromised — the family is revoked wholesale rather than trusting
 * this one presentation, which is what "reuse detection" means in practice.
 */
export async function rotateSession(
  db: Db,
  auth: AuthConfig,
  presentedToken: string,
  meta: SessionMeta,
): Promise<IssuedSession> {
  const row = await findRefreshTokenByHash(db, hashRefreshToken(presentedToken));
  if (row === undefined) {
    throw new AppError('unauthenticated', 'Invalid refresh token.');
  }

  if (row.revokedAt !== null) {
    await revokeRefreshTokenFamily(db, row.familyId);
    throw new AppError('unauthenticated', 'This session was revoked.', {
      reason: 'reuse_detected',
    });
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError('unauthenticated', 'Refresh token expired.');
  }

  await revokeRefreshToken(db, row.id);

  // `refresh_tokens.client` shares its enum with `api_tokens`, but this table only
  // ever holds user sessions — `mintTokenPair` above never writes 'service'.
  const client: Client = row.client === 'desktop' ? 'desktop' : 'web';
  return mintTokenPair(db, auth, row.userId, client, row.familyId, row.id, meta);
}

/** Logout: just revokes, and never mints a replacement. A token that does not
 *  resolve to a row is treated as already-logged-out rather than an error. */
export async function revokeSession(db: Db, presentedToken: string): Promise<void> {
  const row = await findRefreshTokenByHash(db, hashRefreshToken(presentedToken));
  if (row !== undefined) {
    await revokeRefreshToken(db, row.id);
  }
}
