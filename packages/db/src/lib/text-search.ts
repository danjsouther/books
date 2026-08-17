import { and, sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * `LIKE`/`ILIKE` metacharacters have to be neutralised before user input is
 * interpolated into a pattern, or a member typing `%` into a search box matches
 * every row and `_` matches any single character — not wrong results so much as
 * a search that quietly stops meaning what it looks like it means. The escape
 * character itself is escaped first, otherwise a trailing `\` in the query
 * escapes the `%` this function appends and the pattern becomes a literal.
 */
function escapeLikePattern(token: string): string {
  return token.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Beyond this, extra tokens buy nothing and only lengthen the clause chain —
 *  a pasted paragraph shouldn't become a 400-way `AND`. */
const MAX_TOKENS = 8;

/**
 * Splits a free-text query on whitespace and requires every token to appear
 * somewhere in `column`, case-insensitively and in any order — so "stormlight
 * archive" finds "The Stormlight Archive", which a single `ILIKE '%q%'` over
 * the raw query never could. That single-substring form was what every `q`
 * filter in this package used, and it made multi-word searches fail exactly
 * when a member typed the most natural thing.
 *
 * Returns `undefined` for an empty or whitespace-only query so callers can
 * push the result straight into their `(SQL | undefined)[]` clause list and let
 * `and(...)` drop it, matching how the other optional filters compose.
 *
 * Deliberately still `ILIKE`, not `pg_trgm`/`tsvector`: a contains-match per
 * token cannot use the btree indexes, but at this catalog's size that is
 * irrelevant, and trigram or full-text indexing is a migration plus an
 * extension for a problem nobody has yet.
 */
export function tokenizedMatch(column: AnyColumn | SQL, q: string): SQL | undefined {
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return undefined;
  return and(
    ...tokens.map((token) => sql`${column} ILIKE ${`%${escapeLikePattern(token)}%`} ESCAPE '\\'`),
  );
}
