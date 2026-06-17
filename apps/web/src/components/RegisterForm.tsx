import { useState } from 'react';
import { authClient } from '../lib/auth';

/**
 * Email + password + display-name registration form.
 *
 * Per better-auth config (apps/api/src/auth.ts), the API requires:
 *  - Email verification before the account becomes fully active
 *  - Passwords ≥ 12 characters
 *  - A `name` field (display name)
 *
 * On success, the user gets auto-signed-in (better-auth's `autoSignIn: true`)
 * but the session is "pending verification" until they click the link in
 * the verification email. The page tells them what to do.
 */
export function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authClient.signUp.email({
        email,
        password,
        name,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not create account. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-3 text-center">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>Account created.</strong> You're ready to sign in.
        </div>
        <a
          href="/login"
          className="inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Display name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

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
          autoComplete="new-password"
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
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}