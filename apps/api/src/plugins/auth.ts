/**
 * Fastify plugin: mount better-auth as `/api/auth/*`.
 *
 * Better-auth's `handler` function returns a Fetch-style Request/Response, which we
 * adapt to Fastify's native req/rep via `inject`. This is the official integration
 * pattern from the better-auth docs.
 *
 * Reference: https://better-auth.com/docs/integrations/fastify
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { auth } from '../auth.js';

const betterAuthPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  fastify.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    // Build a Fetch Request that better-auth can consume.
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, String(value));
      }
    }

    // Read raw body for POST/PUT/PATCH/DELETE
    let body: Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Fastify exposes the raw payload via request.raw (Node IncomingMessage)
      const chunks: Buffer[] = [];
      for await (const chunk of request.raw) {
        chunks.push(chunk as Buffer);
      }
      const raw = Buffer.concat(chunks);
      if (raw.length > 0) {
        body = raw;
        headers.set('content-length', String(raw.length));
      }
    }

    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      body,
    });
    const response = await auth.handler(req);

    // Copy response headers to Fastify reply
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    reply.status(response.status);

    const responseBody = response.body ? await response.text() : '';
    return reply.send(responseBody);
  });
});

export default betterAuthPlugin;
