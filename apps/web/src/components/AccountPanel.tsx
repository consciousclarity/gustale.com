import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth';

interface SessionData {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    role: string;
    createdAt: string;
  };
}

/**
 * Account panel — shows current session info, sign-out, and a link to the
 * contribute page once auth lands a UI for that. Server-rendered this is
 * not, because the session cookie lives on api.gustale.com and can't be
 * read during SSR on gustale.com.
 */
export function AccountPanel() {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await authClient.getSession();
        if (cancelled) return;
        if (session.data?.user) {
          setData(session.data as unknown as SessionData);
        } else {
          setError('not_signed_in');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load session.');
        }
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

  if (loading) {
    return <p className="text-slate-500">Loading…</p>;
  }

  if (error === 'not_signed_in' || !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-medium">You're not signed in.</p>
        <p className="mt-2 text-sm">
          <a href="/login" className="font-semibold underline">Sign in</a> or{' '}
          <a href="/register" className="font-semibold underline">create an account</a> to contribute to the encyclopedia.
        </p>
      </div>
    );
  }

  const u = data.user;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Display name
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{u.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{u.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email verified
            </dt>
            <dd className="mt-1 text-sm">
              {u.emailVerified ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Pending — check your inbox
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Role
            </dt>
            <dd className="mt-1 text-sm capitalize text-slate-900">{u.role}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Member since
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {new Date(u.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSignOut}
          type="button"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}