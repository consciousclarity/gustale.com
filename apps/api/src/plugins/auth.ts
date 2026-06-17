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

    // Read raw body for POST/PUT/PATCH/DELETE.
    //
    // IMPORTANT: Fastify registers a default JSON content-type parser that
    // already consumed the request stream and parsed `body` into an object.
    // If we re-read `request.raw` (the Node IncomingMessage stream) it will
    // be empty because the stream has been drained. Use `request.body` when
    // the parser has run; fall back to raw bytes only for non-JSON content
    // types where Fastify leaves the stream untouched.
    let body: string | Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const contentType = (request.headers['content-type'] ?? '').toLowerCase();
      if (contentType.includes('application/json') && request.body !== undefined && request.body !== null) {
        // Fastify parsed it for us; re-serialize to a JSON string for the Fetch Request.
        body = JSON.stringify(request.body);
      } else {
        // Non-JSON body: read the raw stream (only happens for things like
        // multipart/form-data which better-auth currently doesn't accept).
        const chunks: Buffer[] = [];
        for await (const chunk of request.raw) {
          chunks.push(chunk as Buffer);
        }
        const raw = Buffer.concat(chunks);
        if (raw.length > 0) body = raw;
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
