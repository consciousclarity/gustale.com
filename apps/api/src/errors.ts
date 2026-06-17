import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { env } from './env.js';

/**
 * Single source of truth for HTTP error responses across the API.
 *
 * Every error response has the same shape:
 *
 *   {
 *     error:   string   // short machine-readable code, snake_case
 *     message: string   // human-readable description
 *     code:    number   // HTTP status code (mirrors the response status)
 *     traceId: string   // request ID — match this to the server log line
 *   }
 *
 * Optional fields:
 *
 *   details: unknown    // e.g. Zod flattened issues for 400 responses
 *   fields:  string[]   // field names that failed validation
 *
 * `traceId` is the Fastify-generated request ID (UUID v4). It appears in
 * every structured log line via `req.log` so a user-supplied trace ID
 * from an error response can be grepped out of Pino logs.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

interface ErrorBody {
  error: string;
  message: string;
  code: number;
  traceId: string;
  details?: unknown;
  fields?: string[];
}

// ---------------------------------------------------------------------------
// Postgres error shape
// ---------------------------------------------------------------------------

interface PgError extends Error {
  code?: string;       // '23505', '23503', '23502', '23514', ...
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

/**
 * Map a Postgres error code to an HTTP response. Returns `null` if the
 * error doesn't match a known code, in which case the caller falls back
 * to the generic 500 handler.
 *
 * Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
function mapPgError(err: PgError): { status: number; body: Omit<ErrorBody, 'traceId'> } | null {
  switch (err.code) {
    case '23505': { // unique_violation
      // Prefer the constraint name so the client can map it to a field.
      // e.g. "dishes_slug_unique" → "slug".
      const constraint = err.constraint ?? '';
      const fieldMatch = constraint.match(/_([a-z_]+)_unique$/);
      const field = fieldMatch?.[1];
      return {
        status: 409,
        body: {
          error: 'duplicate_value',
          message: field
            ? `A record with this ${field} already exists`
            : 'A record with the provided unique value already exists',
          code: 409,
          ...(field ? { fields: [field] } : {}),
          details: { constraint: err.constraint, detail: err.detail },
        },
      };
    }
    case '23503': { // foreign_key_violation
      return {
        status: 400,
        body: {
          error: 'invalid_reference',
          message: 'Referenced record does not exist',
          code: 400,
          details: { constraint: err.constraint, table: err.table, detail: err.detail },
        },
      };
    }
    case '23502': { // not_null_violation
      return {
        status: 400,
        body: {
          error: 'missing_required_field',
          message: `Missing required field: ${err.column ?? 'unknown'}`,
          code: 400,
          ...(err.column ? { fields: [err.column] } : {}),
          details: { table: err.table, column: err.column },
        },
      };
    }
    case '23514': { // check_violation
      return {
        status: 400,
        body: {
          error: 'constraint_violation',
          message: err.detail ?? 'A constraint was violated',
          code: 400,
          details: { constraint: err.constraint },
        },
      };
    }
    case '22P02': { // invalid_text_representation (e.g. bad UUID)
      return {
        status: 400,
        body: {
          error: 'invalid_input',
          message: 'Invalid value format (e.g. malformed UUID)',
          code: 400,
          details: { detail: err.detail },
        },
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public: programmatic error throwers
// ---------------------------------------------------------------------------

/**
 * Throw a structured HTTP error from any route handler. The error handler
 * catches this and returns the matching JSON shape.
 *
 * Example:
 *
 *   throw httpError(404, 'not_found', `Dish "${slug}" not found`);
 */
export function httpError(status: number, code: string, message: string, details?: unknown): FastifyError {
  const err = new Error(message) as FastifyError & { details?: unknown };
  err.statusCode = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const traceId = request.id;

    // Always log with full context. Pino's request-id binding attaches
    // `reqId` to every line so the trace ID is searchable in logs.
    request.log.error(
      {
        err: error,
        statusCode: (error as FastifyError & { statusCode?: number }).statusCode,
        code: (error as FastifyError & { code?: string }).code,
      },
      'request error',
    );

    // 1. ZodError — 400 validation_error
    if (error instanceof ZodError) {
      const flat = error.flatten();
      const fields = Object.keys(flat.fieldErrors);
      const body: ErrorBody = {
        error: 'validation_error',
        message: 'Invalid request',
        code: 400,
        traceId,
        details: flat,
        ...(fields.length > 0 ? { fields } : {}),
      };
      return reply.status(400).send(body);
    }

    // 2. Postgres errors — map to 4xx with helpful messages
    const pgCode = (error as PgError).code;
    if (pgCode && /^[0-9A-Z]{5}$/.test(pgCode)) {
      const mapped = mapPgError(error as PgError);
      if (mapped) {
        const body: ErrorBody = { ...mapped.body, traceId };
        return reply.status(mapped.status).send(body);
      }
    }

    // 3. Fastify-style errors (HTTP status set by Fastify or @fastify/sensible)
    const fastifyError = error as FastifyError & { details?: unknown };
    if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      const body: ErrorBody = {
        error: fastifyError.code ?? `http_${fastifyError.statusCode}`,
        message: error.message || 'Client error',
        code: fastifyError.statusCode,
        traceId,
        ...(fastifyError.details !== undefined ? { details: fastifyError.details } : {}),
      };
      return reply.status(fastifyError.statusCode).send(body);
    }

    // 4. Everything else — 500. Don't leak internals to clients in prod.
    const message = env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message;
    const body: ErrorBody = {
      error: 'internal_error',
      message,
      code: 500,
      traceId,
      ...(env.NODE_ENV !== 'production' ? { details: error.stack } : {}),
    };
    return reply.status(500).send(body);
  });
}