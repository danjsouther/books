import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export type Client = 'web' | 'desktop';

export interface AccessClaims {
  readonly sub: string;
  readonly cli: Client;
  readonly jti: string;
}

/** Access tokens are stateless JWTs — 15 minutes, HS256, via `jose` (maintained,
 *  WebCrypto-based). Short enough that revocation is never needed for them; the
 *  refresh token is where revocation actually lives. */
export async function signAccessToken(
  userId: string,
  client: Client,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ typ: 'access', cli: client })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${String(ttlSeconds)}s`)
    .sign(key);
}

/** Never throws on an invalid or expired token — callers treat rejection as "not
 *  authenticated", not as an error. */
export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
  if (
    payload['typ'] !== 'access' ||
    typeof payload.sub !== 'string' ||
    (payload['cli'] !== 'web' && payload['cli'] !== 'desktop') ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('Malformed access token.');
  }
  return { sub: payload.sub, cli: payload['cli'], jti: payload.jti };
}

/**
 * Refresh tokens are opaque, high-entropy random values, never JWTs — there is
 * nothing to encode, only something to look up. They are stored only as a SHA-256
 * hash; being 256 bits of randomness already, a slow KDF would add latency to
 * every refresh for no real benefit, which is the standard exception to "always
 * bcrypt".
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The CSRF double-submit value. Not a secret shared with the server ahead of
 *  time — its only job is to be readable by same-origin JavaScript and not by a
 *  cross-site attacker, so any high-entropy string works. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}
