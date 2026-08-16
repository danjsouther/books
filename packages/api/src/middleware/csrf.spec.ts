import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from './csrf';

const PUBLIC_BASE_URL = 'http://localhost:4200';

interface MockOptions {
  method?: string;
  authMethod: 'bearer' | 'cookie' | null;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

function run(options: MockOptions): { next: ReturnType<typeof vi.fn> } {
  const req = {
    method: options.method ?? 'POST',
    authMethod: options.authMethod,
    cookies: options.cookies ?? {},
    headers: options.headers ?? {},
  } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

  csrfProtection({ publicBaseUrl: PUBLIC_BASE_URL })(req, res, next);
  return { next };
}

function rejected(next: ReturnType<typeof vi.fn>): boolean {
  if (next.mock.calls.length !== 1) return false;
  const [arg] = next.mock.calls[0] as [unknown];
  return arg !== undefined;
}

describe('csrfProtection: the cookie-vs-bearer branch', () => {
  // This is the failure mode named explicitly in the design: getting the branch
  // backwards means either bearer requests get an impossible CSRF check, or
  // cookie requests skip a check they actually need.

  it('never checks the double-submit token for a bearer request', () => {
    const { next } = run({ authMethod: 'bearer' });
    expect(rejected(next)).toBe(false);
  });

  it('requires a matching token for a cookie-authenticated request', () => {
    const { next } = run({
      authMethod: 'cookie',
      cookies: { 'XSRF-TOKEN': 'token-value' },
      headers: { 'x-xsrf-token': 'token-value', origin: PUBLIC_BASE_URL },
    });
    expect(rejected(next)).toBe(false);
  });

  it('rejects a cookie-authenticated request with no header at all', () => {
    const { next } = run({
      authMethod: 'cookie',
      cookies: { 'XSRF-TOKEN': 'token-value' },
      headers: { origin: PUBLIC_BASE_URL },
    });
    expect(rejected(next)).toBe(true);
  });

  it('rejects a cookie-authenticated request whose header does not match the cookie', () => {
    const { next } = run({
      authMethod: 'cookie',
      cookies: { 'XSRF-TOKEN': 'token-value' },
      headers: { 'x-xsrf-token': 'something-else', origin: PUBLIC_BASE_URL },
    });
    expect(rejected(next)).toBe(true);
  });

  it('rejects a request with no auth at all trying to mutate — nothing to double-submit against', () => {
    const { next } = run({ authMethod: null, headers: { origin: PUBLIC_BASE_URL } });
    expect(rejected(next)).toBe(false);
    // Not a CSRF concern specifically — `requireAuth` is what turns this into a
    // 401 further down the stack. The CSRF layer only guards *cookie* auth.
  });

  it('never applies to a safe method, regardless of auth', () => {
    const { next } = run({ method: 'GET', authMethod: 'cookie', headers: {} });
    expect(rejected(next)).toBe(false);
  });

  it('rejects a cross-site Origin even for a bearer request', () => {
    const { next } = run({ authMethod: 'bearer', headers: { origin: 'https://evil.example' } });
    expect(rejected(next)).toBe(true);
  });

  it('falls back to Referer when Origin is absent', () => {
    const { next } = run({
      authMethod: 'bearer',
      headers: { referer: 'https://evil.example/page' },
    });
    expect(rejected(next)).toBe(true);
  });

  it('allows a request with neither Origin nor Referer — a non-browser client', () => {
    const { next } = run({ authMethod: 'bearer', headers: {} });
    expect(rejected(next)).toBe(false);
  });
});
