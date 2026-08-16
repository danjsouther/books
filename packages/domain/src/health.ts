/** Response body of `GET /api/v1/health`. */
export interface HealthResponse {
  /** False whenever any checked dependency is failing. */
  readonly ok: boolean;
  /** The `version` from `package.json`, inlined into the bundle at build time. */
  readonly version: string;
}
