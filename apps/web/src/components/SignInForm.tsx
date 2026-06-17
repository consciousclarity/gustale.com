import { useState } from 'react';
import { authClient } from '../lib/auth';

/**
 * Email + password sign-in form.
 *
 * On submit: POST /api/auth/sign-in/email → sets gustale.session_token cookie.
 * On success: window.location to / (full reload so the AuthMenu re-fetches
 *   the session and re-renders).
 * On failure: surface the error message in the red banner below the form.
 */
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function friendlyError(err: unknown): string {
    if (!(err instanceof Error)) {
      return 'Sign-in failed. Please check your email and password.';
    }
    const msg = err.message;
    // Better-auth nests the actual API error message inside the Error object's
    // `.message` field, prefixed by "[plugin/auth]". Show the most useful slice.
    if (msg.includes('Invalid email or password')) {
      return 'Wrong email or password. Try again or reset your password.';
    }
    if (msg.includes('Email not verified')) {
      return 'Check your inbox to verify your email before signing in.';
    }
    if (msg.includes('Too many requests')) {
      return 'Too many sign-in attempts. Wait a minute and try again.';
    }
    if (msg.length < 200) return msg;
    // Otherwise return the raw message (truncated) so the user can see what
    // went wrong without us hiding context.
    return msg.slice(0, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authClient.signIn.email({ email, password });
      // Full reload so the server-rendered header picks up the authed state
      // after hydration re-fetches the session.
      window.location.href = '/';
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <p className="mt-1 text-xs text-slate-500">At least 12 characters.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}