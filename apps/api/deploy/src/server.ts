import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
// Side-effect import: registers the FastifyRequest augmentation (request.parts(),
// request.file()) declared in @fastify/multipart's types/index.d.ts. Without
// this import, TS sees the augmentation as orphaned and the route files get
// "Property 'parts' does not exist on FastifyRequest".
import '@fastify/multipart';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { env } from './env.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDishRoutes } from './routes/dishes.js';
import { registerDishWriteRoutes } from './routes/dishes-write.js';
import { registerIngredientRoutes } from './routes/ingredients.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerDishMediaRoutes } from './routes/dishes-media.js';
import { registerErrorHandler } from './errors.js';
import betterAuthPlugin from './plugins/auth.js';
import authContextPlugin from './plugins/auth-context.js';
import { ensureBuckets } from './lib/minio.js';
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
  // Multipart for media upload. attachFieldsToBody:false keeps the
  // request.parts() async-iterator API we use in routes/media.ts.
  // attachBodyToFields would be the modern API but the async iterator
  // gives us streaming control, which matters once we lift the 20 MB cap.
  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB — must match MAX_BYTES in routes/media.ts
      files: 1,                   // single file per upload
    },
  });

  // Auth (better-auth) — mounted at /api/auth/*
  await app.register(betterAuthPlugin);

  // Auth context — resolves request.user and exposes requireRole helper.
  // Must be registered AFTER better-auth (since it calls auth.api.getSession).
  await app.register(authContextPlugin);

  // Error handler
  registerErrorHandler(app);

  // Ensure MinIO buckets exist before accepting traffic. Idempotent.
  // Logged as a warning on failure so the server still boots (degraded
  // mode: routes will return 500 on media ops until the operator fixes
  // MinIO).
  await ensureBuckets().catch((err) => {
    app.log.warn({ err }, 'ensureBuckets failed at boot; media routes will return 500 until MinIO is reachable');
  });

  // Routes — register static-before-parametric (P27).
  registerHealthRoutes(app);
  registerDishRoutes(app);
  registerDishWriteRoutes(app);
  await app.register(registerIngredientRoutes);
  // The two new route groups are FastifyPluginAsync — await their register
  // so any errors during plugin init (e.g. multipart schema) surface here
  // rather than as a 500 on the first request.
  await app.register(registerMediaRoutes);
  await app.register(registerDishMediaRoutes);

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
