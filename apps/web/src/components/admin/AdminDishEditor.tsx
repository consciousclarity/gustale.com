/**
 * AdminDishEditor — Phase 4 (Admin Dish Editor redo)
 *
 * Four-tab dish editor. In v2, ONLY the Identity tab is fully wired:
 *   - canonicalName, slug, shortDescription
 *   - Save → PATCH /api/dishes/:slug
 *   - Inline Zod-error display
 * The Origin, Ingredients, and Taxonomy tabs are read-only stubs that
 * surface the data SSR-fetched from /api/admin/dishes/:slug so the
 * editor shows a useful dish overview. Full editing of those tabs is
 * planned for v3 (ADM-08/09/10/11).
 *
 * Props contract (matches the SPEC's UI-SPEC.md and the .astro SSR
 * pages):
 *   - initialDish: full admin dish detail
 *   - lookups:    all categories, methods, geos, ingredients
 *   - apiBase:    base URL for the PATCH request
 *
 * Bug fix: the reverted PR had the page passing `dishSlug` + `apiBase`,
 * but the component expects `initialDish` + `lookups` + `apiBase`. This
 * new component honours the correct Props shape.
 *
 * Styling: Tailwind utilities consistent with the existing Gustale
 * React components.
 */
import { useState } from 'react';
import type { AdminDishDetail } from '../../lib/api';

type Tab = 'identity' | 'origin' | 'ingredients' | 'taxonomy';

const TABS: Array<{ id: Tab; label: string; implemented: boolean }> = [
  { id: 'identity', label: 'Identity', implemented: true },
  { id: 'origin', label: 'Origin', implemented: false },
  { id: 'ingredients', label: 'Ingredients', implemented: false },
  { id: 'taxonomy', label: 'Taxonomy', implemented: false },
];

interface Props {
  initialDish: AdminDishDetail;
  lookups: {
    categories: Array<{ id: string; name: string; slug: string; kind: string }>;
    preparationMethods: Array<{ id: string; name: string; slug: string }>;
    geoEntities: Array<{ id: string; name: string; country: string | null }>;
    ingredients: Array<{ id: string; canonicalName: string }>;
  };
  apiBase: string;
}

interface FieldErrors {
  canonicalName?: string;
  slug?: string;
  shortDescription?: string;
  _form?: string;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const labelCls =
  'block font-mono text-xs uppercase tracking-wider text-slate-500 mb-1.5';

const errorCls = 'mt-1 text-sm text-red-600';

export function AdminDishEditor({ initialDish, lookups, apiBase }: Props) {
  const [tab, setTab] = useState<Tab>('identity');
  const [canonicalName, setCanonicalName] = useState(initialDish.canonicalName);
  const [slug, setSlug] = useState(initialDish.slug);
  const [shortDescription, setShortDescription] = useState(
    initialDish.shortDescription ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setSaved(false);
    try {
      const res = await fetch(`${apiBase}/api/dishes/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canonicalName,
          slug,
          shortDescription: shortDescription || null,
        }),
      });
      if (res.status === 400) {
        const body = (await res.json()) as {
          issues?: Array<{ path: (string | number)[]; message: string }>;
        };
        const fieldErrors: FieldErrors = {};
        for (const issue of body.issues ?? []) {
          const field = issue.path[0];
          if (field === 'canonicalName' || field === 'slug' || field === 'shortDescription') {
            fieldErrors[field as keyof FieldErrors] = issue.message;
          } else {
            fieldErrors._form = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setErrors({ _form: `Save failed (${res.status}): ${text || 'unknown error'}` });
        return;
      }
      setSaved(true);
      // If slug changed, redirect so the URL matches.
      if (slug !== initialDish.slug) {
        window.location.href = `/admin/dishes/${encodeURIComponent(slug)}`;
      }
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-slate-900">{initialDish.canonicalName}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono">{initialDish.slug}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {new Date(initialDish.updatedAt).toLocaleString()}</span>
          <span aria-hidden="true">·</span>
          <span>Edit count: {initialDish.editCount}</span>
        </p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`edit-tabpanel-${t.id}`}
            id={`edit-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t.id
                ? 'border-emerald-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900')
            }
          >
            {t.label}
            {!t.implemented && (
              <span className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 font-mono text-[0.65rem] uppercase text-slate-500">
                v3
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'identity' && (
        <form
          role="tabpanel"
          id="edit-tabpanel-identity"
          aria-labelledby="edit-tab-identity"
          onSubmit={handleSave}
          className="space-y-5"
        >
          {saved && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              Saved.
            </div>
          )}
          {errors._form && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errors._form}
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="edit-canonical-name">
              Canonical Name *
            </label>
            <input
              id="edit-canonical-name"
              type="text"
              className={inputCls}
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              maxLength={200}
              required
              aria-invalid={!!errors.canonicalName}
              aria-describedby={errors.canonicalName ? 'edit-canonical-name-error' : undefined}
            />
            {errors.canonicalName && (
              <div id="edit-canonical-name-error" className={errorCls}>
                {errors.canonicalName}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="edit-slug">
              Slug *
            </label>
            <input
              id="edit-slug"
              type="text"
              className={inputCls}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={200}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              required
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'edit-slug-error' : 'edit-slug-help'}
            />
            {errors.slug && (
              <div id="edit-slug-error" className={errorCls}>
                {errors.slug}
              </div>
            )}
            {!errors.slug && (
              <div id="edit-slug-help" className="mt-1 text-xs text-slate-500">
                Lowercase letters, digits, and hyphens. Changing the slug
                reloads the editor on the new URL.
              </div>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="edit-short-description">
              Short Description
            </label>
            <textarea
              id="edit-short-description"
              className={inputCls}
              rows={3}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={500}
              aria-invalid={!!errors.shortDescription}
              aria-describedby={
                errors.shortDescription ? 'edit-short-description-error' : undefined
              }
            />
            {errors.shortDescription && (
              <div id="edit-short-description-error" className={errorCls}>
                {errors.shortDescription}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-4" role="radiogroup">
              {(['draft', 'published', 'archived'] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={initialDish.status === s}
                    readOnly
                    disabled
                  />
                  <span className="capitalize">{s}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Status transitions go through the public publish/archive
              flow (not editable here in v2).
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <a
              href="/admin/dishes"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {tab === 'origin' && (
        <div role="tabpanel" id="edit-tabpanel-origin" className="text-sm text-slate-600">
          <p className="mb-4 italic text-slate-500">
            Origin editing lands in v3 (ADM-08). Current data:
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
            <dt className="font-mono text-xs uppercase text-slate-500">Origin geo id</dt>
            <dd className="font-mono text-xs">{initialDish.originGeoId ?? '—'}</dd>
            <dt className="font-mono text-xs uppercase text-slate-500">Date earliest</dt>
            <dd>{initialDish.originDateEarliest ?? '—'}</dd>
            <dt className="font-mono text-xs uppercase text-slate-500">Date latest</dt>
            <dd>{initialDish.originDateLatest ?? '—'}</dd>
            <dt className="font-mono text-xs uppercase text-slate-500">Period label</dt>
            <dd>{initialDish.originPeriodLabel ?? '—'}</dd>
            <dt className="font-mono text-xs uppercase text-slate-500">Geo entities available</dt>
            <dd>{lookups.geoEntities.length}</dd>
          </dl>
        </div>
      )}

      {tab === 'ingredients' && (
        <div role="tabpanel" id="edit-tabpanel-ingredients" className="text-sm text-slate-600">
          <p className="mb-4 italic text-slate-500">
            Ingredient editing lands in v3 (ADM-09). Current data:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {initialDish.ingredients.map((i, idx) => (
              <li key={`${i.ingredientId}-${idx}`}>
                {i.ingredientName ?? '(unknown)'}
                {i.quantity && ` — ${i.quantity}${i.unit ? ` ${i.unit}` : ''}`}
                {i.isOptional && (
                  <span className="ml-2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-slate-500">
                    optional
                  </span>
                )}
              </li>
            ))}
            {initialDish.ingredients.length === 0 && <li>(none)</li>}
          </ul>
        </div>
      )}

      {tab === 'taxonomy' && (
        <div role="tabpanel" id="edit-tabpanel-taxonomy" className="text-sm text-slate-600">
          <p className="mb-4 italic text-slate-500">
            Taxonomy editing lands in v3 (ADM-08). Current data:
          </p>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Categories</h4>
          <ul className="list-disc pl-5 space-y-1">
            {initialDish.categories.map((c) => (
              <li key={c.categoryId}>{c.categoryName ?? c.categorySlug ?? '(unknown)'}</li>
            ))}
            {initialDish.categories.length === 0 && <li>(none)</li>}
          </ul>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Preparation methods</h4>
          <ul className="list-disc pl-5 space-y-1">
            {initialDish.preparations.map((p) => (
              <li key={p.id}>{p.methodName ?? p.methodSlug ?? '(unknown)'}</li>
            ))}
            {initialDish.preparations.length === 0 && <li>(none)</li>}
          </ul>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Related dishes</h4>
          <ul className="list-disc pl-5 space-y-1">
            {initialDish.relatedDishes.map((r) => (
              <li key={r.id}>
                {r.relatedName ?? r.relatedSlug ?? '(unknown)'}{' '}
                <span className="ml-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-slate-500">
                  {r.relationType}
                </span>
                {r.reason && <em className="ml-1 text-slate-500">— {r.reason}</em>}
              </li>
            ))}
            {initialDish.relatedDishes.length === 0 && <li>(none)</li>}
          </ul>
        </div>
      )}
    </div>
  );
}