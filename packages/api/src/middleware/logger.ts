import pino from 'pino';
import pinoHttp from 'pino-http';
import type { RequestHandler } from 'express';

export const logger = pino({
  // 'silent' under `vitest` (`NODE_ENV=test`) — the request-by-request log line
  // is noise in a test run and drowns out the actual failure output.
  level: process.env['NODE_ENV'] === 'test' ? 'silent' : (process.env['LOG_LEVEL'] ?? 'info'),
  // Credentials must never reach the log stream, even accidentally through an
  // otherwise-innocuous debug line.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
});

export function createHttpLogger(): RequestHandler {
  return pinoHttp({
    logger,
    // Reuse the id `requestId` already assigned rather than minting a second one.
    genReqId: (req) => (req as { id?: string }).id ?? '',
  });
}
