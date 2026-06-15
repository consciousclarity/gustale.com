import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { env } from './env.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDishRoutes } from './routes/dishes.js';
import { registerErrorHandler } from './errors.js';
import betterAuthPlugin from './plugins/auth.js';
import { closeDb } from '@gustale/db';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
        : undefined,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  // Plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });
  await app.register(sensible);

  // Auth (better-auth) — mounted at /api/auth/*
  await app.register(betterAuthPlugin);

  // Error handler
  registerErrorHandler(app);

  // Routes
  registerHealthRoutes(app);
  registerDishRoutes(app);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closeDb();
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  buildServer()
    .then((app) => app.listen({ host: env.HOST, port: env.PORT }))
    .then((address) => {
      // eslint-disable-next-line no-console
      console.log(`Gustale API listening at ${address}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
