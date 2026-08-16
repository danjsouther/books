/**
 * Drops keys whose value is `undefined` rather than merely typed as possibly
 * `undefined`. Needed because `exactOptionalPropertyTypes` treats "optional,
 * absent" and "present with value `undefined`" as different types — a Zod
 * `.partial()` schema's inferred type carries the latter even though nothing a
 * client actually sends produces the former without this pass.
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
