import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '@gustale/db';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async (request, reply) => {
    try {
      const result = await db.execute(sql`SELECT 1 AS ok`);
      const row = (result as any)[0];
      if (row?.ok !== 1) {
        return reply.status(503).send({ status: 'not_ready', reason: 'db_check_failed' });
      }
      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: { database: 'ok' },
      };
    } catch (err) {
      request.log.error({ err }, 'readiness check failed');
      return reply.status(503).send({
        status: 'not_ready',
        reason: 'db_unreachable',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });
}
