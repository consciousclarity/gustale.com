/**
 * ContributorDashboardUserBadge — client-side hydration for the
 * /dashboard hero.
 *
 * On mount, calls the existing `getClientSession()` helper. If a session
 * is found, renders "Signed in as {name or email} · {role}". Otherwise
 * falls back to a sign-in CTA. No new auth infrastructure: the session
 * cookie is read by better-auth's `getSession()` under the hood.
 */
import { useEffect, useState } from 'react';
import { getClientSession, type SessionUser } from '../../lib/session';

interface Props {
  /** Optional className passed from the parent for layout adjustments. */
  className?: string;
}

function pickDisplayLabel(u: SessionUser): string {
  const name = (u.name ?? '').trim();
  if (name.length > 0) return name;
  return u.email || 'Signed in';
}

export function ContributorDashboardUserBadge({ className }: Props) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getClientSession().then((u) => {
      if (cancelled) return;
      setUser(u);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything until the session check resolves — avoids a
  // "Sign in to view your dashboard →" flash for users who are actually
  // signed in (the cookie was just slow to be picked up). The static
  // fallback CTA still lives in the Astro page for the no-JS / static
  // prerender path.
  if (!checked) return null;

  if (!user) {
    return (
      <p className={className ?? 'cd-user cd-user--anon'}>
        <a className="cd-signin" href="/login?redirect=/dashboard">
          Sign in to view your dashboard →
        </a>
      </p>
    );
  }

  const label = pickDisplayLabel(user);
  const role = user.role && user.role !== 'visitor' ? user.role : null;

  return (
    <p className={className ?? 'cd-user'}>
      Signed in as <span className="cd-user__name">{label}</span>
      {role ? <span className="cd-user__role"> · {role}</span> : null}
    </p>
  );
}

export default ContributorDashboardUserBadge;