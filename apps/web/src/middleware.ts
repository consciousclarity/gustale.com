/**
 * Astro middleware — Phase 4 (Admin Dish Editor redo).
 *
 * Intercepts every /admin/* request and gates access by the visitor's
 * session role. Visitors with role >= admin (per the auth hierarchy
 * visitor < contributor < moderator < admin) are allowed through.
 * Everyone else is redirected to /login or gets a 403.
 *
 * Implementation: forwards the request's cookies to the API's
 * better-auth /api/auth/get-session endpoint, which returns the session
 * user including role. This avoids re-implementing session validation
 * and signature checks in the middleware.
 *
 * Build-time safety: the site ships as a fully-static Astro build (no
 * SSR adapter), so this middleware runs only during `astro build`, where
 * there is no request cookie. In that case — and for any request without
 * a session cookie — it FAILS OPEN: the admin pages are emitted as real
 * static HTML (shell only; no data) instead of a /login redirect stub.
 *
 * That is safe because the static shell carries no privileged data: every
 * /api/admin/* call requires admin auth (401 otherwise) and the edge
 * (Caddy, infra/prod/Caddyfile) only exposes /admin on the admins' host
 * and 404s it everywhere else. When a session cookie IS present (e.g. an
 * SSR deploy, or local dev), the full role gate below still applies.
 */
import { defineMiddleware } from 'astro:middleware';

const ROLE_RANK = {
  visitor: 0,
  contributor: 1,
  moderator: 2,
  admin: 3,
} as const;
type UserRole = keyof typeof ROLE_RANK;

interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role?: UserRole;
}

const ADMIN_THRESHOLD: UserRole = 'admin';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Fast path: not an admin route, no work to do.
  if (!pathname.startsWith('/admin')) {
    return next();
  }

  const apiBase = context.locals?.runtime?.env?.PUBLIC_API_BASE
    ?? import.meta.env.PUBLIC_API_BASE
    ?? 'https://api.gustale.recipes';

  const cookieHeader = context.request.headers.get('cookie') ?? '';

  // No session cookie → no session context to validate. This is the
  // build-time (static prerender) path, and also any anonymous request.
  // Fail open: render the admin shell and let the edge (Caddy) + the
  // admin API (401 on /api/admin/*) enforce access. Without this guard,
  // `astro build` would bake a /login redirect stub into every /admin
  // page, making the admin UI unreachable in the static deploy.
  if (!cookieHeader) {
    return next();
  }

  let user: SessionUser | null = null;
  try {
    const res = await fetch(`${apiBase}/api/auth/get-session`, {
      headers: {
        cookie: cookieHeader,
        // better-auth expects this content-type even for empty body.
        'content-type': 'application/json',
      },
    });
    if (res.ok) {
      const body = (await res.json()) as { user?: SessionUser } | null;
      user = body?.user ?? null;
    }
  } catch {
    // API unreachable (build-time, dev without DB, prod outage).
    // Fall through with user=null. Admin React islands will 401 when
    // they hit /api/admin/* — page still renders, just shows nothing.
    user = null;
  }

  // Anonymous → redirect to /login with a redirect query param so the
  // user lands back on /admin after signing in.
  if (!user) {
    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/login?redirect=${target}`, 302);
  }

  // Authenticated but not admin → 403. No redirect, since sending a
  // logged-in user back to /login is a worse UX than a clear "forbidden".
  const userRank = ROLE_RANK[user.role ?? 'visitor'];
  const requiredRank = ROLE_RANK[ADMIN_THRESHOLD];
  if (userRank < requiredRank) {
    return new Response('Forbidden — admin role required', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // Attach the resolved user to locals so admin pages can read it
  // without re-fetching.
  context.locals.user = user;

  return next();
});