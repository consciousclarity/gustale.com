import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { env } from './env.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request, reply) => {
    request.log.error({ err: error }, 'request error');

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid request',
        details: error.flatten(),
      });
    }

    const fastifyError = error as Error & { statusCode?: number; code?: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        error: fastifyError.code ?? 'client_error',
        message: error.message,
      });
    }

    // Don't leak internals in production
    const message = env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message;

    return reply.status(500).send({
      error: 'internal_error',
      message,
    });
  });
}
