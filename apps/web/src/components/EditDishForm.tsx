import { useState, useEffect } from 'react';
import { ApiError, getDishDetail } from '../lib/api';
import { getClientSession, type SessionUser } from '../lib/session';
import type { DishDetailResponse } from '../types/dish';

export interface EditDishFormProps {
  slug: string;
}

/**
 * Edit a dish. PATCHes the existing dish via /api/dishes/:slug.
 *
 * Authorization:
 *   - Drafts: any authenticated user can edit.
 *   - Published: moderator+ only. The form will show a friendly error
 *     if a contributor tries to PATCH a published dish.
 *
 * On successful PATCH, we re-fetch the dish detail to show the diff
 * (the API returns the diff in the PATCH response, but a fresh fetch
 * gives us the canonical after-state for the form to continue editing).
 *
 * If the user is a moderator, the form also shows a "Submit for
 * publishing" button that hits POST /api/dishes/:slug/publish.
 */
export function EditDishForm({ slug }: EditDishFormProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dish, setDish] = useState<DishDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form fields
  const [canonicalName, setCanonicalName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [originDateEarliest, setOriginDateEarliest] = useState('');
  const [originDateLatest, setOriginDateLatest] = useState('');
  const [comment, setComment] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [lastDiff, setLastDiff] = useState<Record<string, { from: unknown; to: unknown }> | null>(null);

  // Auth check
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

  // Initial dish load
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getDishDetail(slug);
        if (cancelled) return;
        setDish(data);
        setCanonicalName(data.dish.canonicalName);
        setShortDescription(data.dish.shortDescription ?? '');
        setLongDescription(data.dish.longDescription ?? '');
        setOriginLat(data.origin?.lat != null ? String(data.origin.lat) : '');
        setOriginLng(data.origin?.lng != null ? String(data.origin.lng) : '');
        setOriginDateEarliest(
          data.dish.originDateEarliest != null ? String(data.dish.originDateEarliest) : '',
        );
        setOriginDateLatest(
          data.dish.originDateLatest != null ? String(data.dish.originDateLatest) : '',
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('Dish not found.');
        } else {
          setLoadError(err instanceof Error ? err.message : 'Could not load dish.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function buildPatchPayload(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (canonicalName !== dish?.dish.canonicalName) {
      out.canonicalName = canonicalName;
    }
    const shortNorm = shortDescription || null;
    if (shortNorm !== (dish?.dish.shortDescription ?? null)) {
      out.shortDescription = shortNorm;
    }
    const longNorm = longDescription || null;
    if (longNorm !== (dish?.dish.longDescription ?? null)) {
      out.longDescription = longNorm;
    }
    if (originLat || originLng) {
      const lat = Number(originLat);
      const lng = Number(originLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.origin = { lat, lng };
      }
    } else if (dish?.origin?.lat != null && dish?.origin?.lng != null) {
      // User cleared both fields — explicitly clear the origin.
      out.origin = null;
    }
    const earliestNorm = originDateEarliest ? Number(originDateEarliest) : null;
    if (earliestNorm !== (dish?.dish.originDateEarliest ?? null)) {
      out.originDateEarliest = earliestNorm;
    }
    const latestNorm = originDateLatest ? Number(originDateLatest) : null;
    if (latestNorm !== (dish?.dish.originDateLatest ?? null)) {
      out.originDateLatest = latestNorm;
    }
    if (comment.trim()) out.comment = comment.trim();
    return out;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setLastDiff(null);

    const payload = buildPatchPayload();
    if (Object.keys(payload).filter((k) => k !== 'comment').length === 0) {
      setSaveError('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `${import.meta.env.PUBLIC_API_BASE ?? ''}/api/dishes/${encodeURIComponent(slug)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body, `Save failed (${res.status})`);
      }
      const json = (await res.json()) as {
        diff?: Record<string, { from: unknown; to: unknown }>;
        dish: { updatedAt: string };
      };
      setLastDiff(json.diff ?? null);
      setSaveSuccess('Saved.');
      // Re-fetch canonical state for next edit.
      const fresh = await getDishDetail(slug);
      setDish(fresh);
      setComment('');
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string } | null;
        setSaveError(body?.message ?? err.message);
      } else if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Could not save.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(): Promise<void> {
    if (!user || user.role !== 'moderator') return;
    setSaveError(null);
    setSaveSuccess(null);
    setPublishing(true);
    try {
      const res = await fetch(
        `${import.meta.env.PUBLIC_API_BASE ?? ''}/api/dishes/${encodeURIComponent(slug)}/publish`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: 'Published via edit page' }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body, `Publish failed (${res.status})`);
      }
      setSaveSuccess('Published.');
      // Redirect to the public dish page.
      window.location.href = `/dishes/${slug}/`;
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string } | null;
        setSaveError(body?.message ?? err.message);
      } else if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Could not publish.');
      }
      setPublishing(false);
    }
  }

  // ─── Render gates ────────────────────────────────────────────────────
  if (!authChecked || loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {loadError}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p>
          <strong>Sign in required.</strong> Editing a dish requires an
          account.
        </p>
        <a
          href={`/login?next=/dishes/${slug}/edit`}
          className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Sign in
        </a>
      </div>
    );
  }

  const isDraft = dish?.dish.status === 'draft';
  const isPublished = dish?.dish.status === 'published';
  const isModerator = user.role === 'moderator' || user.role === 'admin';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {saveError && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {saveSuccess}
        </div>
      )}

      {isPublished && !isModerator && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Note:</strong> This dish is published. Only moderators can
          edit published dishes directly. Your changes will be rejected.
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">The basics</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isDraft
                ? 'bg-amber-50 text-amber-700'
                : isPublished
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {dish?.dish.status}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="canonicalName" className="block text-sm font-medium text-slate-700">
              Dish name <span className="text-rose-500">*</span>
            </label>
            <input
              id="canonicalName"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="shortDescription" className="block text-sm font-medium text-slate-700">
              Short description
            </label>
            <input
              id="shortDescription"
              type="text"
              maxLength={500}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="longDescription" className="block text-sm font-medium text-slate-700">
              Long description
            </label>
            <textarea
              id="longDescription"
              rows={5}
              maxLength={20000}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Origin</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="originLat" className="block text-sm font-medium text-slate-700">
              Latitude
            </label>
            <input
              id="originLat"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={originLat}
              onChange={(e) => setOriginLat(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="originLng" className="block text-sm font-medium text-slate-700">
              Longitude
            </label>
            <input
              id="originLng"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={originLng}
              onChange={(e) => setOriginLng(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="originDateEarliest" className="block text-sm font-medium text-slate-700">
              First attested (year)
            </label>
            <input
              id="originDateEarliest"
              type="number"
              min={-3000}
              max={2100}
              value={originDateEarliest}
              onChange={(e) => setOriginDateEarliest(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="originDateLatest" className="block text-sm font-medium text-slate-700">
              Last attested (year)
            </label>
            <input
              id="originDateLatest"
              type="number"
              min={-3000}
              max={2100}
              value={originDateLatest}
              onChange={(e) => setOriginDateLatest(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Edit summary</h2>
        <p className="mt-1 text-sm text-slate-500">
          Describe what you changed. Recorded in the edit history.
        </p>
        <input
          id="comment"
          type="text"
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="mt-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder="Tightened the description; added ingredient notes"
        />
      </div>

      {lastDiff && Object.keys(lastDiff).length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <h3 className="font-semibold text-emerald-900">Changes saved:</h3>
          <ul className="mt-2 space-y-1 text-emerald-800">
            {Object.entries(lastDiff).map(([field, change]) => (
              <li key={field}>
                <code className="text-xs">{field}</code>:{' '}
                <span className="text-rose-700 line-through">
                  {String(change.from ?? '∅')}
                </span>{' '}
                →{' '}
                <span className="text-emerald-700">
                  {String(change.to ?? '∅')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
        <a href={`/dishes/${slug}/`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to dish page
        </a>
        <div className="flex gap-2">
          {isModerator && isDraft && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || saving}
              className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishing ? 'Publishing…' : 'Publish now'}
            </button>
          )}
          <button
            type="submit"
            disabled={saving || publishing}
            className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}