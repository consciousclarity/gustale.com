/**
 * Global Fastify type augmentations for Gustale.
 *
 * Decorations and helpers registered by plugins (see plugins/auth-context.ts)
 * are exposed on the FastifyInstance and FastifyRequest types here so any
 * route file can use `app.requireUser(request)` with full type safety.
 *
 * IMPORTANT: This is an ambient declaration file (no top-level import/export).
 * If you add an `import` or `export` here it becomes a module, and
 * `declare module 'fastify'` no longer augments the global type. The augmentations
 * would silently stop applying.
 */

import type { AuthenticatedUser, UserRole } from '../plugins/auth-context.js';

declare global {
  namespace FastifyModule {
    // Reserved for future sub-namespace typings.
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }

  interface FastifyInstance {
    requireUser: (request: FastifyRequest) => Promise<AuthenticatedUser>;
    requireRole: (
      request: FastifyRequest,
      minRole: UserRole,
    ) => Promise<AuthenticatedUser>;
  }
}

export {};