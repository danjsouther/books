/** The complete set of error codes the API can return. Shared so the web client
 *  can branch on a code rather than parse a message or guess from a status. */
export type ErrorCode =
  | 'not_found'
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  not_found: 404,
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

/**
 * An error with a code the API knows how to render. Anything else reaching the
 * error handler is a bug and becomes a 500 with a request id and no stack.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Raised when a `PATCH` carries a version other than the record's current one.
 *  Carries the current version so the client can offer to reload and reapply. */
export function staleVersion(label: string, currentVersion: number): AppError {
  return new AppError('conflict', `This ${label} was changed by someone else.`, {
    reason: 'stale_version',
    currentVersion,
  });
}
