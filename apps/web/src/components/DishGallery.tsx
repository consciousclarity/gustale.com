import { useState } from "react";
import type { DishMediaAttachment } from "../types/dish";

export interface DishGalleryProps {
  /** All media attached to the dish. Hero media is omitted via excludeMediaId. */
  media: DishMediaAttachment[];
  /**
   * mediaId currently shown in DishCoverHero (explicit cover or gallery fallback).
   * Excluded by ID so gallery-only dishes do not duplicate the hero image.
   */
  excludeMediaId?: string | null;
}

/**
 * Secondary gallery. Hero lives in DishCoverHero — exclude that mediaId here.
 *
 * Build-time render: the API bakes the same-origin public URL into
 * each media row (`publicUrl` + `variantsUrls`), so the gallery paints
 * real `<img srcset>` tags directly from the static HTML. No
 * `useEffect` fetch, no client-side spinner, no broken `<img>` on
 * first paint.
 */
export function DishGallery({
  media,
  excludeMediaId = null,
}: DishGalleryProps) {
  const gallery = [...media]
    .filter((m) => m.mediaId !== excludeMediaId)
    .sort((a, b) => a.position - b.position);

  const [lightbox, setLightbox] = useState<DishMediaAttachment | null>(null);

  if (gallery.length === 0) return null;

  return (
    <>
      <section aria-labelledby="media-heading" className="dish-gallery">
        <div className="sec-rule">
          <h2 id="media-heading">Gallery</h2>
        </div>

        <ul className="dish-gallery__grid">
          {gallery.map((m) => {
            const src = m.publicUrl;
            const srcSet = buildSrcSet(m.variantsUrls);
            // The gallery uses small thumbnails; the 800w is the
            // natural size for the grid cell. Sizes hint picks the
            // 800w for both 1x and 2x displays.
            const sizes =
              srcSet !== undefined
                ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                : undefined;
            const alt = m.altText ?? "Gallery image";
            return (
              <li key={m.attachmentId}>
                <button
                  type="button"
                  className="dish-gallery__thumb"
                  onClick={() => setLightbox(m)}
                  aria-label={`Open larger view${alt ? `: ${alt}` : ""}`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      srcSet={srcSet}
                      sizes={sizes}
                      alt={alt}
                      loading="lazy"
                      decoding="async"
                      {...(m.width ? { width: m.width } : {})}
                      {...(m.height ? { height: m.height } : {})}
                    />
                  ) : (
                    <span className="dish-gallery__ph" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="dish-gallery__note">
          {gallery.length} more image{gallery.length === 1 ? "" : "s"}
        </p>
      </section>

      {lightbox
        ? (() => {
            const src = lightbox.publicUrl;
            const srcSet = buildSrcSet(lightbox.variantsUrls);
            // Lightbox uses the largest variant by default; the
            // browser picks the 1536w on most viewports.
            const lightboxSrc = pickLargest(lightbox.variantsUrls) ?? src;
            const alt = lightbox.altText ?? "Full-size image";
            return (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Full-size view of ${alt}`}
                className="dish-gallery__lightbox"
                onClick={() => setLightbox(null)}
              >
                <button
                  type="button"
                  className="dish-gallery__lightbox-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox(null);
                  }}
                  aria-label="Close image"
                >
                  Close
                </button>
                {lightboxSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lightboxSrc}
                    srcSet={srcSet}
                    alt={alt}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                {(lightbox.credit || lightbox.license) && (
                  <figcaption className="dish-gallery__lightbox-credit">
                    {lightbox.credit && <span>{lightbox.credit}</span>}
                    {lightbox.credit && lightbox.license && (
                      <span aria-hidden="true"> · </span>
                    )}
                    {lightbox.license && (
                      <span className="dish-gallery__lightbox-license">
                        {lightbox.license}
                      </span>
                    )}
                  </figcaption>
                )}
              </div>
            );
          })()
        : null}
    </>
  );
}

/**
 * Build an `<img srcset>` string from a `{width: publicUrl}` map.
 * See DishCoverHero for the same logic — kept local to avoid a
 * cross-component helper that would need a shared `lib/img.ts` file
 * for a 6-line function.
 */
function buildSrcSet(
  variantsUrls: Record<string, string> | undefined,
): string | undefined {
  if (!variantsUrls) return undefined;
  const entries: string[] = [];
  for (const [width, url] of Object.entries(variantsUrls)) {
    if (typeof url === "string" && url.length > 0) {
      entries.push(`${url} ${width}w`);
    }
  }
  if (entries.length === 0) return undefined;
  return entries.join(", ");
}

/**
 * Pick the largest variant by numeric width key. Returns the URL.
 *
 * Used for the lightbox, which should show the biggest version
 * (1536w typically). Falls back to the publicUrl if there are no
 * variants.
 */
function pickLargest(
  variantsUrls: Record<string, string> | undefined,
): string | undefined {
  if (!variantsUrls) return undefined;
  let best: { width: number; url: string } | undefined;
  for (const [w, url] of Object.entries(variantsUrls)) {
    if (typeof url !== "string" || url.length === 0) continue;
    const n = Number(w);
    if (!Number.isFinite(n)) continue;
    if (!best || n > best.width) {
      best = { width: n, url };
    }
  }
  return best?.url;
}
