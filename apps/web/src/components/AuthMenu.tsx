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
 *
 * Styled with the terracotta editorial design tokens (var(--ink) / --sub /
 * --line / --card / --accent) — no slate/emerald utilities. The avatar is a
 * quiet initial badge on var(--card), never a solid colored circle.
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
        <div className="gnav-auth-mobile">
          <a href="/account" className="gnav-auth-id">
            <span className="gnav-avatar" aria-hidden="true">{initials}</span>
            <span className="gnav-auth-name">{label}</span>
          </a>
          <button onClick={handleSignOut} className="gnav-auth-link" type="button">
            Sign out
          </button>
        </div>
      );
    }

    return (
      <div className="gnav-auth-desktop">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="gnav-avatar gnav-avatar-btn"
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          {initials}
        </button>
        {menuOpen && (
          <div className="gnav-auth-pop" role="menu">
            <div className="gnav-auth-pop-head">
              <p className="gnav-auth-pop-name">{label}</p>
              {user.email && <p className="gnav-auth-pop-email">{user.email}</p>}
            </div>
            <div className="gnav-auth-pop-rule" />
            <a href="/account" className="gnav-auth-pop-item" role="menuitem">
              Account
            </a>
            <button
              onClick={handleSignOut}
              className="gnav-auth-pop-item gnav-auth-pop-signout"
              type="button"
              role="menuitem"
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
      <div className="gnav-auth-mobile">
        <span className="gnav-auth-muted">Not signed in</span>
        <span className="gnav-auth-links">
          <a href="/login" className="gnav-auth-link">Sign in</a>
          <a href="/register" className="gnav-auth-link">Register</a>
        </span>
      </div>
    );
  }

  return (
    <a href="/login" className="gnav-auth-link gnav-auth-signin">
      Sign in
    </a>
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
