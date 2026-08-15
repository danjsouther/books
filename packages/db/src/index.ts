/**
 * `@books/db` is SERVER ONLY. It is deliberately unreachable from `apps/web` —
 * the web tsconfig does not define this alias, so importing it from a component
 * is a compile error.
 *
 * Raw table access is confined to this package. Everything outside it goes
 * through the query builders and the mutation helpers, which is what keeps the
 * soft-delete predicate and the revision trail from being forgotten one call site
 * at a time.
 */

export { createDb, databaseUrl, type Db } from './client';
export { runMigrations } from './migrate';
export { seed } from './seed';

export * as schema from './schema';

export * from './queries/active';
export * from './queries/oauth-states';
export * from './queries/refresh-tokens';
export * from './queries/users';
export * from './mutations/authors';
export * from './mutations/books';
export * from './mutations/series';
export {
  createWithRevision,
  updateWithRevision,
  type Actor,
  type ChangeKind,
  type Tx,
} from './mutations/with-revision';
