/**
 * A relative path, and nothing else. Open redirect is the number-one bug in
 * hand-rolled OAuth: accepting `https://evil.com` or a scheme-relative `//evil.com`
 * as `redirect_to` turns a successful login into a hand-off to an attacker's page.
 * `//evil.com` in particular parses as *relative* to a naive `startsWith('/')`
 * check but is protocol-relative to the browser — hence the explicit exclusion.
 */
export function isSafeRedirectTarget(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}

export const DEFAULT_REDIRECT_TARGET = '/';
