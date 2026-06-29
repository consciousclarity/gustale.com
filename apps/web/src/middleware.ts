/**
 * Astro middleware — Contributor Dashboard (Phase 1, slice 1).
 *
 * Intercepts every /admin/* and /dashboard/* request and gates access
 * by the visitor's session role, using the auth hierarchy
 * visitor < contributor < moderator < admin.
 *
 *   - /admin/*       → role must be >= admin
 *   - /dashboard/*   → role must be >= contributor (admins pass through)
 *   - everything else → no work, next()
 *
 * Implementation: forwards the request's cookies to the API's
 * better-auth /api/auth/get-session endpoint, which returns the session
 * user including role. This avoids re-implementing session validation
 * and signature checks in the middleware.
 *
 * Build-time safety: the site ships as a fully-static Astro build (no
 * SSR adapter), so this middleware runs only during `astro build`, where
 * there is no request cookie. In that case — and for any request without
 * a session cookie — it FAILS OPEN: the gated pages are emitted as real
 * static HTML (shell only; no data) instead of a /login redirect stub.
 *
 * That is safe because the static shell carries no privileged data:
 *   - every /api/admin/* call requires admin auth (401 otherwise), and
 *     the edge (Caddy, infra/prod/Caddyfile) only exposes /admin on the
 *     admins' host and 404s it everywhere else;
 *   - the contributor dashboard shell contains no live per-user data
 *     yet — every card is an empty state — so anonymous prerender is
 *     fine. When a session cookie IS present (e.g. an SSR deploy, or
 *     local dev), the full role gate below still applies.
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

// Contributor dashboard threshold — admins pass through naturally
// (higher rank) so we don't need a separate admin branch.
const DASHBOARD_THRESHOLD: UserRole = 'contributor';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Fast path: not a gated route, no work to do.
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/dashboard')) {
    return next();
  }

  // Resolve the session once per gated request and reuse the result
  // for both /admin and /dashboard branches below. This keeps the
  // fail-open semantics identical for both sections.
  const apiBase = context.locals?.runtime?.env?.PUBLIC_API_BASE
    ?? import.meta.env.PUBLIC_API_BASE
    ?? 'https://api.gustale.recipes';

  const cookieHeader = context.request.headers.get('cookie') ?? '';

  let user: SessionUser | null = null;
  if (cookieHeader) {
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
      // Dashboard pages render the empty-state shell.
      user = null;
    }
  }

  // ─── /admin branch (unchanged behavior) ─────────────────────────
  if (pathname.startsWith('/admin')) {
    // No session cookie → no session context to validate. This is the
    // build-time (static prerender) path, and also any anonymous request.
    // Fail open: render the admin shell and let the edge (Caddy) + the
    // admin API (401 on /api/admin/*) enforce access. Without this guard,
    // `astro build` would bake a /login redirect stub into every /admin
    // page, making the admin UI unreachable in the static deploy.
    if (!cookieHeader) {
      return next();
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
  }

  // ─── /dashboard branch (contributor-gated) ──────────────────────
  // Reuses the resolved `user` from above.
  //
  // Build-time (no cookie): fail open — same rationale as /admin, so
  // `astro build` emits the dashboard shell HTML.
  if (!cookieHeader) {
    return next();
  }

  if (!user) {
    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/login?redirect=${target}`, 302);
  }

  // Anyone below contributor (i.e. `visitor` — better-auth default for
  // never-signed-in users, or anyone explicitly at that tier) gets a
  // clear "register or sign in as a contributor" 403 rather than a
  // redirect, because sending a logged-out-looking user back to /login
  // is the wrong UX. Default new-user role in apps/api/src/auth.ts is
  // `contributor`, so this gate admits every registered user without
  // admitting anonymous visitors.
  const userRank = ROLE_RANK[user.role ?? 'visitor'];
  const dashRank = ROLE_RANK[DASHBOARD_THRESHOLD];
  if (userRank < dashRank) {
    return new Response(
      'Forbidden — contributor access required. Please create an account or sign in.',
      {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      },
    );
  }

  context.locals.user = user;
  return next();
});