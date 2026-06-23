import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth';
import type { SessionUser } from '../lib/session';

interface Props {
  /** True if SSR detected a session cookie on the same origin (dev only). */
  initialAuthed?: boolean;
  variant?: 'desktop' | 'mobile';
}

/**
 * Client-side header that swaps "Sign in" / "Register" for "Account" /
 * "Sign out" once the user is authenticated. Always starts unauthenticated
 * in production (the session cookie lives on api.gustale.com and can't be
 * read by SSR here on gustale.com), then upgrades after hydration.
 */
export function AuthMenu({ initialAuthed = false, variant = 'desktop' }: Props) {
  const [user, setUser] = useState<SessionUser | null>(
    initialAuthed ? { id: '', email: '', name: '', role: 'visitor' } : null,
  );
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
    return <UnauthedMenu variant={variant} />;
  }

  if (user) {
    const label = user.name || user.email;
    const initials = getInitials(label);

    if (variant === 'mobile') {
      return (
        <div className="flex items-center justify-between gap-3 text-sm">
          <a href="/account" className="flex min-w-0 items-center gap-2 text-slate-700">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="truncate">{label}</span>
          </a>
          <button
            onClick={handleSignOut}
            className="shrink-0 font-medium text-slate-500 hover:text-red-600"
            type="button"
          >
            Sign out
          </button>
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white ring-2 ring-white transition hover:bg-emerald-700"
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          {initials}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
              {user.email && (
                <p className="truncate text-[13px] text-slate-500">{user.email}</p>
              )}
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <a
              href="/account"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Account
            </a>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
              type="button"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return <UnauthedMenu variant={variant} />;
}

function UnauthedMenu({ variant }: { variant: 'desktop' | 'mobile' }) {
  if (variant === 'mobile') {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-600">Not signed in</span>
        <a href="/login" className="font-semibold text-emerald-700">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <a
        href="/login"
        className="rounded-full px-3 py-2 font-medium text-slate-600 transition hover:text-emerald-700"
      >
        Sign in
      </a>
    </div>
  );
}

function getInitials(value: string): string {
  const parts = value
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const first = parts[0]?.[0] ?? 'G';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}
