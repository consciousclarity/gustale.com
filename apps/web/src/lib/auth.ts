/**
 * Auth client for Gustale (better-auth).
 *
 * The web front-end talks to the API at `PUBLIC_API_BASE`. Better-auth's
 * React client (`createAuthClient`) exposes typed helpers for sign-in /
 * sign-up / sign-out / session reading. All endpoints sit under
 * `${API_BASE}/api/auth/*` — the same paths the Fastify plugin mounts.
 *
 * Cookie behavior: better-auth sets a `gustale.session_token` cookie
 * scoped to `api.gustale.com`. The browser sends it automatically on
 * cross-origin XHR/fetch calls to the API as long as the request is
 * `credentials: 'include'` (which the client uses by default) and the
 * server's `trustedOrigins` includes the page origin (already configured
 * for `gustale.com` and `www.gustale.com`).
 */
import { createAuthClient } from 'better-auth/react';

const API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:4000';

export const authClient = createAuthClient({
  baseURL: API_BASE,
  // Surface server errors as thrown exceptions rather than swallowed returns,
  // so React components can render the actual message.
  throw: true,
});

export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>;
export type AuthUser = AuthSession extends { data: { user: infer U } } ? U : never;