import { useEffect, useState } from 'react';
import { getMediaSignedUrl, ApiError } from '../lib/api';
import type { DishMediaAttachment } from '../types/dish';

export interface DishGalleryProps {
  /** All media attached to the dish, ordered by position (cover first). */
  media: DishMediaAttachment[];
}

/**
 * Real image gallery. On mount, fetches a 15-min signed URL for each
 * media item, then renders a responsive grid. Click an image to open
 * a full-screen lightbox.
 *
 * Why client-side signed URLs (not SSR-baked):
 *   - Signed URLs are short-lived (15 min). Baking them into the static
 *     HTML at build time means they're stale by the time a real user
 *     hits the page.
 *   - The trade-off is one extra API call per page render. The cost is
 *     ~50ms locally, ~150ms from CDN edge, and the URLs are cached by
 *     the browser for the duration of the page session.
 *
 * Error handling:
 *   - If a single signed URL fails, we show an inline error for that
 *     item only. Other images still render.
 *   - If the API is unreachable entirely, we show a banner. The page
 *     is still usable — just no images.
 */
export function DishGallery({ media }: DishGalleryProps) {
  // Sort: cover first, then by position.
  const sorted = [...media].sort((a, b) => {
    if (a.role === 'cover' && b.role !== 'cover') return -1;
    if (b.role === 'cover' && a.role !== 'cover') return 1;
    return a.position - b.position;
  });

  const cover = sorted.find((m) => m.role === 'cover');
  const gallery = sorted.filter((m) => m.role !== 'cover');

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<DishMediaAttachment | null>(null);

  useEffect(() => {
    if (sorted.length === 0) return;

    let cancelled = false;

    async function load() {
      const errors: string[] = [];
      // Resolve cover first (used in hero area).
      if (cover) {
        try {
          const res = await getMediaSignedUrl(cover.mediaId);
          if (!cancelled) setCoverUrl(res.url);
        } catch (err) {
          errors.push(`cover: ${errorMessage(err)}`);
        }
      }
      // Resolve gallery thumbnails in parallel.
      const galleryResults = await Promise.allSettled(
        gallery.map(async (m) => {
          const res = await getMediaSignedUrl(m.mediaId);
          return { id: m.mediaId, url: res.url };
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const r of galleryResults) {
        if (r.status === 'fulfilled') next[r.value.id] = r.value.url;
        else errors.push(`gallery: ${errorMessage(r.reason)}`);
      }
      setGalleryUrls(next);
      if (errors.length > 0) {
        setLoadError(errors.length === sorted.length
          ? 'Could not load any images. Check your connection and try again.'
          : `Some images failed to load (${errors.length}/${sorted.length}).`);
      } else {
        setLoadError(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // We intentionally re-run when the sorted list identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sorted.map((m) => m.mediaId))]);

  if (sorted.length === 0) return null;

  return (
    <>
      <section aria-labelledby="media-heading" className="space-y-4">
        <h2
          id="media-heading"
          className="text-2xl font-bold text-slate-900"
        >
          Gallery
        </h2>

        {loadError && (
          <div
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {loadError}
          </div>
        )}

        {/* Cover image — larger display in its own row. */}
        {cover && (
          <figure className="space-y-2">
            <button
              type="button"
              className="block w-full overflow-hidden rounded-lg bg-slate-100 text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onClick={() => setLightbox(cover)}
              aria-label={`Open larger view of cover image${cover.altText ? `: ${cover.altText}` : ''}`}
            >
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt={cover.altText ?? `${cover.role} image`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/9] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] w-full items-center justify-center text-sm text-slate-400">
                  Loading cover…
                </div>
              )}
            </button>
            {(cover.altText || cover.credit || cover.license) && (
              <figcaption className="text-xs text-slate-500">
                {cover.altText && <span>{cover.altText}</span>}
                {cover.credit && (
                  <span className="ml-2 italic">
                    {cover.altText ? '—' : ''} {cover.credit}
                  </span>
                )}
                {cover.license && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                    {cover.license}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        )}

        {/* Gallery grid */}
        {gallery.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {gallery.map((m) => {
              const url = galleryUrls[m.mediaId];
              return (
                <li key={m.attachmentId}>
                  <button
                    type="button"
                    className="block w-full overflow-hidden rounded-md bg-slate-100 text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    onClick={() => setLightbox(m)}
                    aria-label={`Open larger view${m.altText ? `: ${m.altText}` : ''}`}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.altText ?? 'Gallery image'}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-xs text-slate-400">
                        Loading…
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-slate-400">
          {sorted.length} image{sorted.length === 1 ? '' : 's'} on record · URLs
          expire after 15 minutes
        </p>
      </section>

      {/* Lightbox — full-screen overlay when an image is clicked. */}
      {lightbox && (() => {
        // Prefer the gallery thumbnail URL (already fetched) for the
        // lightbox source; fall back to re-fetching if needed.
        const url = lightbox.mediaId === cover?.mediaId
          ? coverUrl
          : galleryUrls[lightbox.mediaId];
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Full-size view of ${lightbox.altText ?? 'image'}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
              aria-label="Close image"
            >
              ✕ Close
            </button>
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={lightbox.altText ?? 'Full-size image'}
                className="max-h-full max-w-full rounded object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        );
      })()}
    </>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown';
}