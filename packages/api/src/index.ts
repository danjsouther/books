/**
 * `@books/api` is the HTTP API as a *library*: it exports a router and knows
 * nothing about listening on a port or serving static files. `apps/server` mounts
 * it. Splitting the API into its own process later is then a change to the host,
 * not to the API.
 */

export { createApiRouter, type ApiDeps } from './router';
