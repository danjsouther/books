/**
 * True when `error` is Postgres rejecting an insert on the named unique-slug
 * constraint. Drizzle wraps the driver error, so the constraint name lives on
 * `.cause` (see `test-support.ts`'s `violatedConstraint`) rather than the
 * message — this is the retry loop's signal to try the next slug suffix
 * instead of a real failure to surface.
 */
export function isUniqueSlugViolation(error: unknown, constraintName: string): boolean {
  const cause = (error as { cause?: { constraint?: string } }).cause;
  return cause?.constraint === constraintName;
}
