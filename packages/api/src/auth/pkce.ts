import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes — 256 bits, comfortably beyond what a single-use, 10-minute
 *  token needs to be unguessable. */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

/** Base64url of 32 random bytes is 43 characters, inside RFC 7636's 43–128 range. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function codeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
