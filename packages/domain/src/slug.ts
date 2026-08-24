const MAX_SLUG_LENGTH = 80;

/** Base36, no `crypto` import — isomorphic, and this only needs to be
 *  unpredictable enough to break a tie, not cryptographically random. */
function randomToken(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Cuts `value` to at most `maxLength` characters without splitting a word —
 *  backs up to the previous hyphen rather than cutting mid-word. */
function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf('-');
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}

/**
 * Lowercases, transliterates to ASCII, and collapses everything else to single
 * hyphens. A title with no ASCII letters or digits at all (all emoji, all CJK)
 * normalizes to nothing — that gets a short random fallback rather than an empty
 * or all-hyphen slug.
 */
export function slugify(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = truncateAtWordBoundary(ascii, MAX_SLUG_LENGTH);
  return base.length > 0 ? base : `item-${randomToken()}`;
}

/** `attempt` 1 is the bare base; every attempt after that appends a numeric
 *  suffix, so a title collision reads as `book-title-2`, `book-title-3`, ... */
export function nextSlugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}

/**
 * Resolves `base` to a slug no existing row holds, trying `base` itself first
 * and then a numeric suffix. `exists` is injected rather than baked in so this
 * stays DB-free: a mutation checks a live transaction, a backfill script checks
 * an in-memory set built once instead of one query per row.
 *
 * Past `maxAttempts` (a run of near-simultaneous creates sharing a title, or a
 * pathological backfill) falls back to a random suffix rather than looping
 * forever or throwing on a legitimate, if unlikely, title.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = nextSlugCandidate(base, attempt);
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${randomToken()}`;
}
