import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth';
import type { SessionUser } from '../lib/session';

interface Props {
  /** True if SSR detected a session cookie on the same origin (dev only). */
  initialAuthed?: boolean;
}

/**
 * Client-side header that swaps "Sign in" / "Register" for "Account" /
 * "Sign out" once the user is authenticated. Always starts unauthenticated
 * in production (the session cookie lives on api.gustale.com and can't be
 * read by SSR here on gustale.com), then upgrades after hydration.
 */
export function AuthMenu({ initialAuthed = false }: Props) {
  const [user, setUser] = useState<SessionUser | null>(
    initialAuthed ? { id: '', email: '', name: '', role: 'visitor' } : null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await authClient.getSession();
        if (cancelled) return;
        const u = session.data?.user as unknown as
          | { id: string; email: string; name: string; role?: string }
          | undefined;
        if (u) {
          setUser({
            id: u.id,
            email: u.email,
            name: u.name,
            role: (u.role ?? 'visitor') as SessionUser['role'],
          });
        }
      } catch {
        // Network error or 401 — leave unauthenticated.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await authClient.signOut();
      window.location.href = '/';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sign-out failed', err);
    }
  }

  if (loading && !user) {
    // While loading, render the unauthenticated state — avoids a one-frame
    // "Account" flash on pages where the user actually isn't logged in.
    return <UnauthedMenu />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <a href="/account" className="font-medium text-slate-700 hover:text-emerald-700">
          {user.name || user.email}
        </a>
        <button
          onClick={handleSignOut}
          className="text-slate-500 hover:text-red-600"
          type="button"
        >
          Sign out
        </button>
      </div>
    );
  }

  return <UnauthedMenu />;
}

function UnauthedMenu() {
  return (
    <div className="flex items-center gap-4 text-sm">
      <a href="/login" className="font-medium text-slate-700 hover:text-emerald-700">
        Sign in
      </a>
    </div>
  );
}