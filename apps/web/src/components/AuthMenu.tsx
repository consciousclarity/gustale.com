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
        <div className="auth-mobile">
          <a href="/account" className="auth-avatar-sm">
            <span className="auth-initials-sm">{initials}</span>
            <span className="auth-label">{label}</span>
          </a>
          <button
            onClick={handleSignOut}
            className="auth-signout"
            type="button"
          >
            Sign out
          </button>
        </div>
      );
    }

    return (
      <div className="auth-relative">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="auth-avatar-btn"
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          {initials}
        </button>
        {menuOpen && (
          <div className="auth-dropdown">
            <div className="auth-dropdown-header">
              <p className="auth-dropdown-name">{label}</p>
              {user.email && (
                <p className="auth-dropdown-email">{user.email}</p>
              )}
            </div>
            <div className="auth-dropdown-divider" />
            <a
              href="/account"
              className="auth-dropdown-item"
            >
              Account
            </a>
            <a
              href="/dashboard"
              className="auth-dropdown-item"
            >
              Dashboard
            </a>
            <button
              onClick={handleSignOut}
              className="auth-dropdown-item auth-signout-btn"
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
      <div className="auth-mobile">
        <span className="auth-signed-out">Not signed in</span>
        <a href="/login" className="auth-signin-link">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="auth-links">
      <a
        href="/login"
        className="btn btn-outline"
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
