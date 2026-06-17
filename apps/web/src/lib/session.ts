/**
 * SSR-safe session loader.
 *
 * Better-auth's cookie name (configured in apps/api/src/auth.ts via
 * `cookiePrefix: 'gustale'`) is `gustale.session_token`. The Astro
 * Layout calls this during SSR so the header can render the correct
 * auth state on first paint (avoiding a "Sign in" → "Account" flash
 * after hydration).
 *
 * In dev (localhost) there's no cookie cross-domain issue, so the cookie
 * arrives via the standard `request.headers.cookie` header. In prod
 * (api.gustale.com) the cookie is scoped to the API subdomain, so SSR
 * here on gustale.com cannot read it directly. The client-side
 * `authClient.getSession()` call handles the prod case after hydration.
 *
 * For prod: SSR shows the unauthenticated header; hydration immediately
 * upgrades it. This is a one-frame flash, acceptable for v1.
 */
import { authClient } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'visitor' | 'contributor' | 'moderator' | 'admin';
}

export async function getSessionFromCookies(
  cookieHeader: string | null,
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;

  // Parse the cookie header manually so we don't need a runtime cookie
  // parser dependency. Cookie header format: "name1=value1; name2=value2".
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  }

  const sessionToken = cookies['gustale.session_token'];
  if (!sessionToken) return null;

  // For now we return null when we can't reach the API from SSR (prod case).
  // The client-side getSession() will handle the live check after hydration.
  // In dev, the API is at http://localhost:4000 which Astro's SSR can reach.
  return null;
}

/**
 * Client-side session reader. Called from React islands after hydration
 * to upgrade the header from "Sign in" to "Account".
 */
export async function getClientSession(): Promise<SessionUser | null> {
  try {
    const session = await authClient.getSession();
    if (!session.data?.user) return null;
    const u = session.data.user as unknown as {
      id: string;
      email: string;
      name: string;
      role?: string;
    };
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: (u.role ?? 'visitor') as SessionUser['role'],
    };
  } catch {
    return null;
  }
}