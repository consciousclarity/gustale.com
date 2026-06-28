/**
 * Fastify plugin: auth context + role enforcement.
 *
 * Reads the better-auth session from request headers and decorates the
 * FastifyRequest with `request.user` (or null for anonymous). Also exposes
 * a `requireRole(minRole)` helper that throws 401 / 403 as appropriate.
 *
 * Why a separate plugin: better-auth's existing plugin in plugins/auth.ts
 * handles the *response* side (mounting /api/auth/*). This plugin handles
 * the *request* side (reading sessions for protected app routes).
 *
 * Performance: better-auth's `getSession` does a database hit unless the
 * cookie cache is hot (5 min TTL, set in auth.ts). For high-traffic routes,
 * consider per-route caching. For v1, a DB hit per protected request is
 * acceptable.
 */
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { auth } from '../auth.js';

// Roles in privilege order. Higher index = more privilege.
export const ROLE_RANK = {
  visitor: 0,
  contributor: 1,
  moderator: 2,
  admin: 3,
} as const;

export type UserRole = keyof typeof ROLE_RANK;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: UserRole;
  displayName: string | null;
}

// Augment FastifyRequest so handlers can read request.user with type safety.
// The instance-level decorations (requireUser, requireRole) are declared in
// src/types/fastify.d.ts so the augmentation is picked up by all files in
// the project, not just this one.
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

/**
 * Convert better-auth's headers (Node IncomingMessage.headers) into the
 * `Headers` object that better-auth's `getSession` expects.
 */
function fastifyHeadersToHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, String(v));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

/**
 * Read the session for the current request. Returns null if anonymous.
 * Errors (DB down, malformed cookie) are logged and treated as anonymous
 * so a transient auth infra issue doesn't 500 the whole app.
 */
async function getRequestUser(req: FastifyRequest): Promise<AuthenticatedUser | null> {
  try {
    const headers = fastifyHeadersToHeaders(req);
    const result = await auth.api.getSession({ headers });
    if (!result || !result.user) return null;
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
      // better-auth stores `role` as additional field; default to 'contributor'
      // if missing (defensive — auth.ts sets a defaultValue).
      role: ((result.user as unknown as { role?: UserRole }).role ?? 'contributor') as UserRole,
      displayName:
        (result.user as unknown as { displayName?: string | null }).displayName ?? null,
    };
  } catch (err) {
    req.log.warn({ err }, 'auth.getSession failed; treating request as anonymous');
    return null;
  }
}

const authContextPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Decorate every request with `user`. Resolved lazily inside onRequest hooks.
  fastify.decorateRequest('user', null);

  // Resolve user once per request, before route handlers run.
  fastify.addHook('onRequest', async (request) => {
    request.user = await getRequestUser(request);
  });

  // requireUser: throws 401 if not authenticated.
  fastify.decorate('requireUser', async function (request: FastifyRequest) {
    if (!request.user) {
      const err = new Error('Authentication required') as Error & { statusCode: number; code: string };
      err.statusCode = 401;
      err.code = 'unauthenticated';
      throw err;
    }
    return request.user;
  });

  // requireRole(minRole): throws 401 if anonymous, 403 if role too low.
  fastify.decorate('requireRole', async function (request: FastifyRequest, minRole: UserRole) {
    const user = await (fastify as unknown as { requireUser: (r: FastifyRequest) => Promise<AuthenticatedUser> })
      .requireUser(request);
    if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
      const err = new Error(`Requires role: ${minRole}`) as Error & { statusCode: number; code: string };
      err.statusCode = 403;
      err.code = 'forbidden';
      throw err;
    }
    return user;
  });
});

// Type augmentation for the decorated methods.
declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (request: FastifyRequest) => Promise<AuthenticatedUser>;
    requireRole: (request: FastifyRequest, minRole: UserRole) => Promise<AuthenticatedUser>;
  }
}

export default authContextPlugin;