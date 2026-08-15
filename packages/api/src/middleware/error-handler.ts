import { isAppError } from '@books/domain';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requestIdOf } from '../types';
import { logger } from './logger';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/**
 * The tail of the `/api/v1` middleware stack. `AppError` and `ZodError` map to a
 * clean `{ error: { code, message, details? } }`; anything else is a bug and
 * becomes a 500 carrying only a request id — never a stack, never the original
 * message, since an uncaught error might be carrying something it should not.
 */
// Express identifies error middleware by arity, so `_next` must stay even though
// this handler never calls it — the `^_` prefix is what keeps it lint-clean.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: { code: 'validation_failed', message: 'Invalid request.', details: err.issues },
    };
    res.status(400).json(body);
    return;
  }

  const id = requestIdOf(req);
  logger.error({ err, requestId: id }, 'Unhandled error');
  const body: ErrorBody = {
    error: { code: 'internal_error', message: 'Something went wrong.', requestId: id },
  };
  res.status(500).json(body);
}
