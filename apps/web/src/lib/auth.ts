/**
 * Auth client for Gustale (better-auth).
 *
 * The web front-end talks to the API via same-origin /api/auth/* in the
 * browser (Caddy reverse-proxies to the API container on the server).
 * During SSR, we use PUBLIC_API_BASE as the absolute URL.
 *
 * Cookie behavior: better-auth sets a `gustale.session_token` cookie
 * scoped to the page origin. Same-origin means the browser sends it
 * automatically on every XHR/fetch as long as the request is
 * `credentials: 'include'` (which the client uses by default).
 */
import { createAuthClient } from 'better-auth/react';

// Build-time API host — used only during SSR. In the browser we always
// use the same origin (empty string) so the auth client goes through
// Caddy's /api proxy and the cookie stays on the page's domain.
const SSR_API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:4000';
const API_BASE = import.meta.env.SSR ? SSR_API_BASE : '';

export const authClient = createAuthClient({
  baseURL: API_BASE,
  // Surface server errors as thrown exceptions rather than swallowed returns,
  // so React components can render the actual message.
  throw: true,
});

export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>;
export type AuthUser = AuthSession extends { data: { user: infer U } } ? U : never;