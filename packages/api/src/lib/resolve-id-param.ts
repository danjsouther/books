import { AppError } from '@books/domain';
import type { Router } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lets every route on `router` accept a slug wherever it currently takes `:id`,
 * with no change to any individual handler — they all just read
 * `req.params[paramName]`, which this rewrites to the real id before any of
 * them run. A value that already looks like a UUID passes through untouched.
 *
 * A slug that fails to resolve raises `not_found` here rather than passing the
 * raw string through: every handler downstream feeds this param straight into
 * a `uuid`-typed column comparison, and a non-UUID string there is a Postgres
 * syntax error — an opaque 500 — not the clean 404 an unknown id gets today.
 */
export function resolveIdParam(
  router: Router,
  paramName: string,
  lookupBySlug: (slug: string) => Promise<{ id: string } | undefined>,
): void {
  router.param(paramName, (req, _res, next, value: string) => {
    if (UUID_RE.test(value)) {
      next();
      return;
    }
    lookupBySlug(value)
      .then((row) => {
        if (row === undefined) {
          next(new AppError('not_found', 'No such record.'));
          return;
        }
        req.params[paramName] = row.id;
        next();
      })
      .catch(next);
  });
}
