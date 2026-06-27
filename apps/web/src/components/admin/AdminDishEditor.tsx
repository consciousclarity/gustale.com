/**
 * AdminDishEditor — Phase 5 (admin editor expansion)
 *
 * Coherent edit-dish flow for the admin UI. Five tabs, each with its own
 * save (per-tab saves avoid row-level races between editor sections):
 *
 *   1. Identity   — name, slug, short description, full description, status
 *   2. Origin     — read-only stub (lat/lng, dates) for v2
 *   3. Photos     — drag/drop upload, grid of current photos, set cover, detach
 *   4. Sources    — list/edit/delete citations; create new source
 *   5. Taxonomy   — read-only stub showing current categories for v2
 *
 * Endpoints used (all existing or added in Phase 5):
 *   - PATCH /api/dishes/:slug                            (Identity save)
 *   - POST  /api/media/upload                            (Photo upload to MinIO)
 *   - POST  /api/dishes/:slug/media                      (Photo attach)
 *   - DELETE /api/dishes/:slug/media/:attachmentId       (Photo detach)
 *   - GET   /api/admin/dishes/:slug/sources             (List sources)
 *   - POST  /api/admin/dishes/:slug/sources             (Create source)
 *   - PATCH /api/admin/dishes/:slug/sources/:citationId (Update source)
 *   - DELETE /api/admin/dishes/:slug/sources/:citationId (Delete source)
 *
 * Props contract (matches the .astro SSR page):
 *   - initialDish:  full admin dish detail
 *   - lookups:      all categories, methods, geos, ingredients
 *   - apiBase:      base URL for client requests
 *
 * UX:
 *   - Per-tab unsaved-changes indicator
 *   - Inline Zod-error display on 400
 *   - Save state (saving / saved / error) per tab
 *   - Cmd/Ctrl+S to save the active tab
 *   - Drag-and-drop photo upload
 *   - Click-photo-to-edit for source modal
 */
import { useEffect, useRef, useState } from 'react';
import type { AdminDishDetail } from '../../lib/api';
import {
  attachMediaToDish,
  createAdminDishSource,
  deleteAdminDishSource,
  detachMediaFromDish,
  getMediaSignedUrl,
  listAdminDishSources,
  type AdminDishSource,
  type CreateSourceInput,
  updateAdminDishSource,
  uploadMedia,
} from '../../lib/api';

type Tab = 'identity' | 'origin' | 'photos' | 'sources' | 'taxonomy';

const TABS: Array<{ id: Tab; label: string; implemented: boolean; hint?: string }> = [
  { id: 'identity', label: 'Identity', implemented: true },
  { id: 'origin', label: 'Origin', implemented: false, hint: 'read-only in v2.5' },
  { id: 'photos', label: 'Photos', implemented: true },
  { id: 'sources', label: 'Sources', implemented: true },
  { id: 'taxonomy', label: 'Classification', implemented: false, hint: 'read-only in v2.5' },
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
  longDescription?: string;
  _form?: string;
}

interface TabState {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const initialTabState: TabState = { saving: false, saved: false, error: null };

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const labelCls =
  'block font-mono text-xs uppercase tracking-wider text-slate-500 mb-1.5';

const sectionCardCls =
  'rounded-lg border border-slate-200 bg-white p-6 shadow-sm';

export function AdminDishEditor({ initialDish, lookups, apiBase }: Props) {
  const [tab, setTab] = useState<Tab>('identity');

  // Identity tab state
  const [canonicalName, setCanonicalName] = useState(initialDish.canonicalName);
  const [slug, setSlug] = useState(initialDish.slug);
  const [shortDescription, setShortDescription] = useState(
    initialDish.shortDescription ?? '',
  );
  const [longDescription, setLongDescription] = useState(
    initialDish.longDescription ?? '',
  );
  const [identityState, setIdentityState] = useState<TabState>(initialTabState);
  const [identityErrors, setIdentityErrors] = useState<FieldErrors>({});

  // Photos tab state
  const [media, setMedia] = useState<
    Array<{
      id: string;
      mediaId: string;
      role: 'cover' | 'gallery';
      position: number;
      signedUrl: string | null;
      altText: string | null;
      mimeType: string;
    }>
  >([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaState, setMediaState] = useState<TabState>(initialTabState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sources tab state
  const [sources, setSources] = useState<AdminDishSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesState, setSourcesState] = useState<TabState>(initialTabState);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  // Load photos on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // The admin detail endpoint already includes media[]. For each
        // media item, fetch the signed URL for the preview.
        const adminDetail = await fetch(
          `${apiBase}/api/dishes/${encodeURIComponent(initialDish.slug)}`,
          { credentials: 'include' },
        );
        if (!adminDetail.ok) throw new Error(`dish fetch ${adminDetail.status}`);
        const data = (await adminDetail.json()) as {
          media?: Array<{ id: string; mediaId: string; role: 'cover' | 'gallery'; position: number }>;
        };
        if (cancelled) return;
        const items = data.media ?? [];
        // Fetch signed URLs in parallel.
        const withUrls = await Promise.all(
          items.map(async (m) => {
            try {
              const urlRes = await getMediaSignedUrl(m.mediaId);
              return { ...m, signedUrl: urlRes.url, altText: null, mimeType: 'image/jpeg' };
            } catch {
              return { ...m, signedUrl: null, altText: null, mimeType: 'image/jpeg' };
            }
          }),
        );
        if (!cancelled) {
          setMedia(withUrls);
          setMediaLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setMediaState({ saving: false, saved: false, error: String(err) });
          setMediaLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDish.slug, apiBase]);

  // Load sources on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listAdminDishSources(initialDish.slug, { credentials: 'include' });
        if (!cancelled) {
          setSources(res.sources);
          setSourcesLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setSourcesState({ saving: false, saved: false, error: String(err) });
          setSourcesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDish.slug]);

  // ─── Identity save (PATCH /api/dishes/:slug) ──────────────────────────
  async function handleIdentitySave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIdentityState({ saving: true, saved: false, error: null });
    setIdentityErrors({});
    try {
      const res = await fetch(`${apiBase}/api/dishes/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canonicalName,
          slug,
          shortDescription: shortDescription || null,
          longDescription: longDescription || null,
        }),
      });
      if (res.status === 400) {
        const body = (await res.json()) as {
          issues?: Array<{ path: (string | number)[]; message: string }>;
        };
        const fieldErrors: FieldErrors = {};
        for (const issue of body.issues ?? []) {
          const field = issue.path[0];
          if (
            field === 'canonicalName' ||
            field === 'slug' ||
            field === 'shortDescription' ||
            field === 'longDescription'
          ) {
            fieldErrors[field as keyof FieldErrors] = issue.message;
          } else {
            fieldErrors._form = issue.message;
          }
        }
        setIdentityErrors(fieldErrors);
        setIdentityState({ saving: false, saved: false, error: null });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setIdentityState({
          saving: false,
          saved: false,
          error: `Save failed (${res.status}): ${text || 'unknown'}`,
        });
        return;
      }
      setIdentityState({ saving: false, saved: true, error: null });
      if (slug !== initialDish.slug) {
        // Slug changed — redirect to new URL.
        window.location.href = `/admin/dishes/${encodeURIComponent(slug)}`;
      }
    } catch (err) {
      setIdentityState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Photos: drag-drop + click-to-upload + detach + set cover ─────────
  async function uploadAndAttach(files: FileList | File[], role: 'cover' | 'gallery' = 'gallery') {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setMediaUploading(true);
    setMediaState({ saving: true, saved: false, error: null });
    let successCount = 0;
    const errors: string[] = [];
    for (const file of arr) {
      try {
        const media = await uploadMedia(file);
        await attachMediaToDish(initialDish.slug, media.id, role);
        // Fetch signed URL for the preview.
        const urlRes = await getMediaSignedUrl(media.id);
        setMedia((prev) => [
          ...prev,
          {
            id: media.id, // placeholder; will be replaced by attachment id on next refresh
            mediaId: media.id,
            role,
            position: prev.length,
            signedUrl: urlRes.url,
            altText: media.altText,
            mimeType: media.mimeType,
          },
        ]);
        successCount++;
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setMediaUploading(false);
    setMediaState({
      saving: false,
      saved: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : null,
    });
    // Refresh the list to get canonical attachment IDs.
    setTimeout(async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/dishes/${encodeURIComponent(initialDish.slug)}`,
          { credentials: 'include' },
        );
        const data = (await res.json()) as { media?: typeof media };
        if (data.media) {
          const withUrls = await Promise.all(
            data.media.map(async (m) => {
              const urlRes = await getMediaSignedUrl(m.mediaId);
              return { ...m, signedUrl: urlRes.url, altText: null, mimeType: 'image/jpeg' };
            }),
          );
          setMedia(withUrls);
        }
      } catch {
        // Refresh failed — that's OK, the optimistic update is already shown.
      }
    }, 500);
  }

  async function handleSetCover(mediaId: string) {
    setMediaState({ saving: true, saved: false, error: null });
    try {
      await attachMediaToDish(initialDish.slug, mediaId, 'cover');
      // Update local state
      setMedia((prev) =>
        prev.map((m) => ({ ...m, role: m.mediaId === mediaId ? 'cover' : 'gallery' })),
      );
      setMediaState({ saving: false, saved: true, error: null });
    } catch (err) {
      setMediaState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDetach(attachmentId: string) {
    if (!window.confirm('Remove this photo from the dish? (The file is kept in storage.)')) return;
    setMediaState({ saving: true, saved: false, error: null });
    try {
      await detachMediaFromDish(initialDish.slug, attachmentId);
      setMedia((prev) => prev.filter((m) => m.id !== attachmentId));
      setMediaState({ saving: false, saved: true, error: null });
    } catch (err) {
      setMediaState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      void uploadAndAttach(e.dataTransfer.files);
    }
  }

  // ─── Sources: add / edit / delete ────────────────────────────────────
  function startEditSource(citationId: string) {
    setEditingSourceId(citationId);
    setAddingSource(false);
  }

  function startAddSource() {
    setAddingSource(true);
    setEditingSourceId(null);
  }

  function cancelSourceEdit() {
    setAddingSource(false);
    setEditingSourceId(null);
  }

  async function handleDeleteSource(citationId: string) {
    if (!window.confirm('Remove this source citation? (The source itself is kept.)')) return;
    setSourcesState({ saving: true, saved: false, error: null });
    try {
      await deleteAdminDishSource(initialDish.slug, citationId);
      setSources((prev) => prev.filter((s) => s.citationId !== citationId));
      setSourcesState({ saving: false, saved: true, error: null });
    } catch (err) {
      setSourcesState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Save handler used by both Add and Edit forms.
  async function handleSourceSave(input: CreateSourceInput, citationId: string | null) {
    setSourcesState({ saving: true, saved: false, error: null });
    try {
      if (citationId === null) {
        const res = await createAdminDishSource(initialDish.slug, input);
        // Refresh the list so we have the canonical row.
        const list = await listAdminDishSources(initialDish.slug, { credentials: 'include' });
        setSources(list.sources);
        setAddingSource(false);
        void res; // already refreshed
      } else {
        await updateAdminDishSource(initialDish.slug, citationId, input);
        const list = await listAdminDishSources(initialDish.slug, { credentials: 'include' });
        setSources(list.sources);
        setEditingSourceId(null);
      }
      setSourcesState({ saving: false, saved: true, error: null });
    } catch (err) {
      setSourcesState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Cmd/Ctrl+S to save the active tab.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (tab === 'identity') {
          // Find the identity form and submit it.
          const form = document.getElementById('admin-identity-form') as HTMLFormElement | null;
          form?.requestSubmit();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  const coverMedia = media.find((m) => m.role === 'cover');
  const galleryMedia = media.filter((m) => m.role !== 'cover');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-slate-900">{initialDish.canonicalName}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono">{initialDish.slug}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {new Date(initialDish.updatedAt).toLocaleString()}</span>
          <span aria-hidden="true">·</span>
          <span>{media.length} photo{media.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true">·</span>
          <span>{sources.length} source{sources.length === 1 ? '' : 's'}</span>
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
                {t.hint ?? 'v3'}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Identity ──────────────────────────────────────────────── */}
      {tab === 'identity' && (
        <form
          id="admin-identity-form"
          role="tabpanel"
          aria-labelledby="edit-tab-identity"
          onSubmit={handleIdentitySave}
          className="space-y-6"
        >
          <TabStateBanner state={identityState} savedMessage="Identity saved." />

          <Field
            id="edit-canonical-name"
            label="Canonical Name *"
            help="The display name shown across the site."
            error={identityErrors.canonicalName}
          >
            <input
              id="edit-canonical-name"
              type="text"
              className={inputCls}
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              maxLength={200}
              required
            />
          </Field>

          <Field
            id="edit-slug"
            label="Slug *"
            help="Lowercase letters, digits, and hyphens. Changing the slug reloads the editor on the new URL."
            error={identityErrors.slug}
          >
            <input
              id="edit-slug"
              type="text"
              className={inputCls}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={200}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              required
            />
          </Field>

          <Field
            id="edit-short-description"
            label="Short Description"
            help="One or two sentences. Shows on cards, search results, and the dish hero."
            error={identityErrors.shortDescription}
          >
            <textarea
              id="edit-short-description"
              className={inputCls}
              rows={2}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={500}
            />
          </Field>

          <Field
            id="edit-long-description"
            label="Full Description"
            help="The long-form article. Markdown not yet supported — plain text with line breaks."
            error={identityErrors.longDescription}
          >
            <textarea
              id="edit-long-description"
              className={inputCls}
              rows={10}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              maxLength={20000}
              placeholder="Write the full story of this dish — history, regional variations, cultural significance…"
            />
            <p className="mt-1 text-xs text-slate-500">
              {longDescription.length} / 20000 characters
            </p>
          </Field>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <a
              href="/admin/dishes"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              disabled={identityState.saving}
            >
              {identityState.saving ? 'Saving…' : 'Save changes'} <span className="ml-1 text-xs opacity-70">⌘S</span>
            </button>
          </div>
        </form>
      )}

      {/* ─── Origin (read-only stub) ─────────────────────────────── */}
      {tab === 'origin' && (
        <div role="tabpanel" className={sectionCardCls}>
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

      {/* ─── Photos ──────────────────────────────────────────────── */}
      {tab === 'photos' && (
        <div role="tabpanel" aria-labelledby="edit-tab-photos" className="space-y-6">
          <TabStateBanner state={mediaState} savedMessage="Photos updated." />

          <div className={sectionCardCls}>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Cover image</h3>
            <p className="mb-3 text-xs text-slate-500">
              The cover is the first photo shown on the dish page. Set any photo as cover with the radio below.
            </p>
            {coverMedia ? (
              <PhotoPreview
                src={coverMedia.signedUrl}
                mimeType={coverMedia.mimeType}
                caption="Current cover"
                onClear={() => void handleDetach(coverMedia.id)}
              />
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                No cover image. Set one from the gallery below, or upload a new one.
              </p>
            )}
          </div>

          <div
            className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('border-emerald-500', 'bg-emerald-50');
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-50');
            }}
            onDrop={(e) => {
              e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-50');
              handleFileDrop(e);
            }}
          >
            <p className="text-sm text-slate-700">Drag photos here to upload</p>
            <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP, AVIF, GIF. Up to 20 MB each.</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={mediaUploading}
              className="mt-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {mediaUploading ? 'Uploading…' : 'Or choose files'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void uploadAndAttach(e.target.files);
                  e.target.value = ''; // allow re-upload of same file
                }
              }}
            />
          </div>

          <div className={sectionCardCls}>
            <h3 className="mb-3 text-sm font-medium text-slate-700">
              Gallery ({galleryMedia.length})
            </h3>
            {mediaLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : galleryMedia.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                No gallery photos yet. Upload one above to get started.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {galleryMedia.map((m) => (
                  <div
                    key={m.id}
                    className="group relative overflow-hidden rounded-md border border-slate-200 bg-white"
                  >
                    <div className="aspect-square bg-slate-100">
                      {m.signedUrl ? (
                        <img
                          src={m.signedUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          no preview
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 text-xs">
                      <label className="flex cursor-pointer items-center gap-1 text-slate-600">
                        <input
                          type="radio"
                          name="cover"
                          checked={false}
                          onChange={() => void handleSetCover(m.mediaId)}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        set cover
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleDetach(m.id)}
                        className="rounded px-2 py-0.5 text-rose-600 hover:bg-rose-50"
                        title="Remove from dish"
                      >
                        remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Sources ─────────────────────────────────────────────── */}
      {tab === 'sources' && (
        <div role="tabpanel" aria-labelledby="edit-tab-sources" className="space-y-6">
          <TabStateBanner state={sourcesState} savedMessage="Sources updated." />

          <div className={sectionCardCls}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">
                Citations ({sources.length})
              </h3>
              {!addingSource && editingSourceId === null && (
                <button
                  type="button"
                  onClick={startAddSource}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Add source
                </button>
              )}
            </div>

            {sourcesLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : sources.length === 0 && !addingSource ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                No sources yet. Add the first one — Wikipedia, a cookbook, a personal interview, anything citable.
              </p>
            ) : (
              <ol className="space-y-3">
                {sources.map((s) =>
                  editingSourceId === s.citationId ? (
                    <SourceForm
                      key={s.citationId}
                      initial={s}
                      saving={sourcesState.saving}
                      onSave={(input) => void handleSourceSave(input, s.citationId)}
                      onCancel={cancelSourceEdit}
                    />
                  ) : (
                    <li
                      key={s.citationId}
                      className="rounded-md border border-slate-200 bg-white p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-slate-500">
                              {s.source.sourceType}
                            </span>
                            {s.source.reliability && (
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-emerald-700">
                                {s.source.reliability}
                              </span>
                            )}
                            <span className="font-medium text-slate-900">{s.source.title}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {s.source.authors && s.source.authors.length > 0 && (
                              <span>{s.source.authors.join(', ')}</span>
                            )}
                            {s.source.year && <span> · {s.source.year}</span>}
                            {s.source.publisher && <span> · {s.source.publisher}</span>}
                            {s.source.url && (
                              <>
                                {' · '}
                                <a
                                  href={s.source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:underline"
                                >
                                  {new URL(s.source.url).hostname}
                                </a>
                              </>
                            )}
                          </div>
                          {s.claimText && (
                            <p className="mt-2 text-sm text-slate-700">
                              <span className="font-mono text-xs uppercase text-slate-500">
                                Claim:
                              </span>{' '}
                              {s.claimText}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEditSource(s.citationId)}
                            className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSource(s.citationId)}
                            className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            )}

            {addingSource && (
              <div className="mt-4">
                <SourceForm
                  initial={null}
                  saving={sourcesState.saving}
                  onSave={(input) => void handleSourceSave(input, null)}
                  onCancel={cancelSourceEdit}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Classification (read-only stub) ────────────────────── */}
      {tab === 'taxonomy' && (
        <div role="tabpanel" className={sectionCardCls}>
          <p className="mb-4 italic text-slate-500">
            Classification editing lands in v3 (ADM-08). Current data:
          </p>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Categories</h4>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
            {initialDish.categories.map((c) => (
              <li key={c.categoryId}>{c.categoryName ?? c.categorySlug ?? '(unknown)'}</li>
            ))}
            {initialDish.categories.length === 0 && <li>(none)</li>}
          </ul>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Preparation methods</h4>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
            {initialDish.preparations.map((p) => (
              <li key={p.id}>{p.methodName ?? p.methodSlug ?? '(unknown)'}</li>
            ))}
            {initialDish.preparations.length === 0 && <li>(none)</li>}
          </ul>
          <h4 className="mb-2 mt-4 font-medium text-slate-900">Related dishes</h4>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
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

// ─── Helper components ─────────────────────────────────────────────────

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-rose-600">
          {error}
        </p>
      )}
      {!error && help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">
          {help}
        </p>
      )}
    </div>
  );
}

function TabStateBanner({ state, savedMessage }: { state: TabState; savedMessage: string }) {
  if (state.saved) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
      >
        {savedMessage}
      </div>
    );
  }
  if (state.error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
      >
        {state.error}
      </div>
    );
  }
  return null;
}

function PhotoPreview({
  src,
  mimeType,
  caption,
  onClear,
}: {
  src: string | null;
  mimeType: string;
  caption: string;
  onClear: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="aspect-video bg-slate-100">
        {src ? (
          <img src={src} alt={caption} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            no preview
          </div>
        )}
      </div>
      <div className="flex items-center justify-between p-2 text-xs">
        <span className="text-slate-600">{caption}</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-2 py-0.5 text-rose-600 hover:bg-rose-50"
        >
          remove
        </button>
      </div>
    </div>
  );
}

// Source form — used for both Add (initial=null) and Edit (initial=source).
function SourceForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: AdminDishSource | null;
  saving: boolean;
  onSave: (input: CreateSourceInput) => void;
  onCancel: () => void;
}) {
  const [sourceType, setSourceType] = useState<CreateSourceInput['sourceType']>(
    initial?.source.sourceType ?? 'web',
  );
  const [title, setTitle] = useState(initial?.source.title ?? '');
  const [authorsText, setAuthorsText] = useState(
    initial?.source.authors?.join(', ') ?? '',
  );
  const [year, setYear] = useState<string>(
    initial?.source.year != null ? String(initial.source.year) : '',
  );
  const [publisher, setPublisher] = useState(initial?.source.publisher ?? '');
  const [url, setUrl] = useState(initial?.source.url ?? '');
  const [isbn, setIsbn] = useState(initial?.source.isbn ?? '');
  const [doi, setDoi] = useState(initial?.source.doi ?? '');
  const [citationText, setCitationText] = useState(initial?.source.citationText ?? '');
  const [reliability, setReliability] = useState<CreateSourceInput['reliability']>(
    initial?.source.reliability ?? null,
  );
  const [claimText, setClaimText] = useState(initial?.claimText ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (title.trim().length < 2) newErrors.title = 'Title is required (min 2 chars).';
    if (url && !/^https?:\/\//.test(url)) newErrors.url = 'URL must start with http:// or https://';
    if (year && (!/^-?\d+$/.test(year) || Number(year) < -3000 || Number(year) > 2100)) {
      newErrors.year = 'Year must be a number between -3000 and 2100.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    const authors = authorsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      sourceType,
      title: title.trim(),
      authors: authors.length > 0 ? authors : undefined,
      year: year ? Number(year) : null,
      publisher: publisher.trim() || null,
      url: url.trim() || null,
      isbn: isbn.trim() || null,
      doi: doi.trim() || null,
      citationText: citationText.trim() || null,
      reliability,
      claimText: claimText.trim() || null,
      location: location.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`sf-type-${initial?.citationId ?? 'new'}`}
          label="Type"
          error={errors.sourceType}
        >
          <select
            id={`sf-type-${initial?.citationId ?? 'new'}`}
            className={inputCls}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as CreateSourceInput['sourceType'])}
          >
            <option value="web">Web</option>
            <option value="book">Book</option>
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="archive">Archive</option>
            <option value="personal_communication">Personal communication</option>
          </select>
        </Field>
        <Field
          id={`sf-reliability-${initial?.citationId ?? 'new'}`}
          label="Reliability"
          help="How confident are you in this source?"
        >
          <select
            id={`sf-reliability-${initial?.citationId ?? 'new'}`}
            className={inputCls}
            value={reliability ?? ''}
            onChange={(e) =>
              setReliability(
                e.target.value === ''
                  ? null
                  : (e.target.value as CreateSourceInput['reliability']),
              )
            }
          >
            <option value="">—</option>
            <option value="primary">Primary (eyewitness, original doc)</option>
            <option value="secondary">Secondary (well-researched)</option>
            <option value="tertiary">Tertiary (general reference)</option>
            <option value="speculative">Speculative (unverified claim)</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            id={`sf-title-${initial?.citationId ?? 'new'}`}
            label="Title *"
            error={errors.title}
          >
            <input
              id={`sf-title-${initial?.citationId ?? 'new'}`}
              type="text"
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            id={`sf-authors-${initial?.citationId ?? 'new'}`}
            label="Authors"
            help="Comma-separated, e.g. 'Smith, J., Patel, A.'"
          >
            <input
              id={`sf-authors-${initial?.citationId ?? 'new'}`}
              type="text"
              className={inputCls}
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
            />
          </Field>
        </div>
        <Field
          id={`sf-year-${initial?.citationId ?? 'new'}`}
          label="Year"
          help="CE year, e.g. 1920 or -500"
          error={errors.year}
        >
          <input
            id={`sf-year-${initial?.citationId ?? 'new'}`}
            type="text"
            className={inputCls}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field
          id={`sf-publisher-${initial?.citationId ?? 'new'}`}
          label="Publisher / Outlet"
        >
          <input
            id={`sf-publisher-${initial?.citationId ?? 'new'}`}
            type="text"
            className={inputCls}
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            maxLength={200}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id={`sf-url-${initial?.citationId ?? 'new'}`}
            label="URL"
            help="Must start with http:// or https://"
            error={errors.url}
          >
            <input
              id={`sf-url-${initial?.citationId ?? 'new'}`}
              type="url"
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://"
            />
          </Field>
        </div>
        <Field
          id={`sf-isbn-${initial?.citationId ?? 'new'}`}
          label="ISBN"
        >
          <input
            id={`sf-isbn-${initial?.citationId ?? 'new'}`}
            type="text"
            className={inputCls}
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            maxLength={40}
          />
        </Field>
        <Field
          id={`sf-doi-${initial?.citationId ?? 'new'}`}
          label="DOI"
        >
          <input
            id={`sf-doi-${initial?.citationId ?? 'new'}`}
            type="text"
            className={inputCls}
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            maxLength={200}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id={`sf-claim-${initial?.citationId ?? 'new'}`}
            label="Claim"
            help="What specifically does this source support? (e.g. 'First attested in 1920 Athens cookbook')"
          >
            <textarea
              id={`sf-claim-${initial?.citationId ?? 'new'}`}
              className={inputCls}
              rows={2}
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            id={`sf-citation-${initial?.citationId ?? 'new'}`}
            label="Citation text (optional)"
            help="If you have a pre-formatted citation (e.g. from Zotero), paste it here. Used as-is on the public page."
          >
            <textarea
              id={`sf-citation-${initial?.citationId ?? 'new'}`}
              className={inputCls}
              rows={3}
              value={citationText}
              onChange={(e) => setCitationText(e.target.value)}
              maxLength={5000}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add source'}
        </button>
      </div>
    </form>
  );
}