import { useState, useEffect } from 'react';
import { ApiError } from '../lib/api';
import { getClientSession, type SessionUser } from '../lib/session';

export interface NewDishFormProps {
  /**
   * If true, the form is rendered as a server-side stub that requires
   * hydration to be functional. The Astro page sets this when SSR can
   * reach the API (dev) vs prod (where SSR can't read the session
   * cookie cross-domain). Either way, the form gracefully degrades to
   * "please sign in" if no session is found.
   */
  // Reserved for future use — kept for symmetry with the edit form.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _placeholder?: boolean;
}

/**
 * Create a new dish as a draft.
 *
 * Any authenticated user can submit. New dishes always start as
 * `status: 'draft'` and require a moderator to publish (existing
 * Wikipedia-style workflow).
 *
 * Auth: reads the client session on mount. If no session is found,
 * shows a "please sign in" hint instead of the form.
 *
 * On success: redirects to the new dish's edit page so the user can
 * keep filling in details (origin, dates, etc.). The slug becomes
 * the URL path.
 */
export function NewDishForm(_props: NewDishFormProps = {}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [canonicalName, setCanonicalName] = useState('');
  const [slug, setSlug] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [originDateEarliest, setOriginDateEarliest] = useState('');
  const [originDateLatest, setOriginDateLatest] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the client session on mount. SSR can't read the cross-domain
  // session cookie on prod, so this is client-only.
  useEffect(() => {
    let cancelled = false;
    void getClientSession().then((u) => {
      if (cancelled) return;
      setUser(u);
      setAuthChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-suggest slug from canonical name as the user types (debounced
  // via React's controlled-input pattern; updates only on blur).
  function slugifyFromName(): void {
    if (slug) return; // don't overwrite a user-typed slug
    const next = canonicalName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200);
    setSlug(next);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    // Lat/lng are optional but if either is provided, both must be.
    let origin: { lat: number; lng: number } | undefined;
    if (originLat || originLng) {
      const lat = Number(originLat);
      const lng = Number(originLng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setError('Latitude and longitude must be numbers.');
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError('Coordinates out of range (lat ±90, lng ±180).');
        return;
      }
      origin = { lat, lng };
    }

    const body: Record<string, unknown> = {
      canonicalName,
      slug,
    };
    if (shortDescription) body.shortDescription = shortDescription;
    if (longDescription) body.longDescription = longDescription;
    if (origin) body.origin = origin;
    if (originDateEarliest) body.originDateEarliest = Number(originDateEarliest);
    if (originDateLatest) body.originDateLatest = Number(originDateLatest);

    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.PUBLIC_API_BASE ?? ''}/api/dishes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(
          res.status,
          data,
          `Create failed (${res.status})`,
        );
      }
      const json = (await res.json()) as { dish: { slug: string } };
      // Redirect to the new dish's edit page so the user can keep adding
      // ingredients, categories, preparations, etc.
      window.location.href = `/dishes/${json.dish.slug}/edit`;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; message?: string } | null;
        if (body?.error === 'slug_conflict') {
          setError(`Slug "${slug}" is already taken. Pick a different one.`);
        } else {
          setError(body?.message ?? err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not create dish. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p>
          <strong>Sign in required.</strong> Creating a dish requires an
          account.
        </p>
        <a
          href="/login?next=/dishes/new"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        >
          {error}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">The basics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Just the dish name to start. You can fill in everything else after
          creating the draft.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="canonicalName" className="block text-sm font-medium text-slate-700">
              Dish name <span className="text-rose-500">*</span>
            </label>
            <input
              id="canonicalName"
              name="canonicalName"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              onBlur={slugifyFromName}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Sushi"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-slate-700">
              URL slug <span className="text-rose-500">*</span>
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="sushi-japanese"
            />
            <p className="mt-1 text-xs text-slate-500">
              Lowercase letters, digits, and hyphens. Cannot be changed later
              without breaking external links.
            </p>
          </div>

          <div>
            <label htmlFor="shortDescription" className="block text-sm font-medium text-slate-700">
              Short description
            </label>
            <input
              id="shortDescription"
              name="shortDescription"
              type="text"
              maxLength={500}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="A traditional Japanese dish of vinegared rice…"
            />
          </div>

          <div>
            <label htmlFor="longDescription" className="block text-sm font-medium text-slate-700">
              Long description
            </label>
            <textarea
              id="longDescription"
              name="longDescription"
              rows={5}
              maxLength={20000}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Sushi is a traditional Japanese dish of prepared vinegared rice, usually with some sugar and salt…"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Origin</h2>
        <p className="mt-1 text-sm text-slate-500">Optional. Where the dish originated.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="originLat" className="block text-sm font-medium text-slate-700">
              Latitude
            </label>
            <input
              id="originLat"
              name="originLat"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={originLat}
              onChange={(e) => setOriginLat(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="35.6762"
            />
          </div>
          <div>
            <label htmlFor="originLng" className="block text-sm font-medium text-slate-700">
              Longitude
            </label>
            <input
              id="originLng"
              name="originLng"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={originLng}
              onChange={(e) => setOriginLng(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="139.6503"
            />
          </div>
          <div>
            <label htmlFor="originDateEarliest" className="block text-sm font-medium text-slate-700">
              First attested (year)
            </label>
            <input
              id="originDateEarliest"
              name="originDateEarliest"
              type="number"
              min={-3000}
              max={2100}
              value={originDateEarliest}
              onChange={(e) => setOriginDateEarliest(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="1800"
            />
          </div>
          <div>
            <label htmlFor="originDateLatest" className="block text-sm font-medium text-slate-700">
              Last attested (year)
            </label>
            <input
              id="originDateLatest"
              name="originDateLatest"
              type="number"
              min={-3000}
              max={2100}
              value={originDateLatest}
              onChange={(e) => setOriginDateLatest(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="1900"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <a href="/dishes" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create draft'}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        You'll be redirected to the edit page where you can add ingredients,
        categories, preparations, and sources. A moderator will review and
        publish when ready.
      </p>
    </form>
  );
}