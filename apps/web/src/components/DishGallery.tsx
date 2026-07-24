import { useEffect, useState } from "react";
import { ApiError, getMediaSignedUrl } from "../lib/api";
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
 * Empty / loading cells use a quiet placeholder — never "Loading cover…".
 */
export function DishGallery({
  media,
  excludeMediaId = null,
}: DishGalleryProps) {
  const gallery = [...media]
    .filter((m) => m.mediaId !== excludeMediaId)
    .sort((a, b) => a.position - b.position);

  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<DishMediaAttachment | null>(null);

  useEffect(() => {
    if (gallery.length === 0) return;

    let cancelled = false;

    async function load() {
      const errors: string[] = [];
      const galleryResults = await Promise.allSettled(
        gallery.map(async (m) => {
          const res = await getMediaSignedUrl(m.mediaId);
          return { id: m.mediaId, url: res.url };
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const r of galleryResults) {
        if (r.status === "fulfilled") next[r.value.id] = r.value.url;
        else errors.push(`gallery: ${errorMessage(r.reason)}`);
      }
      setGalleryUrls(next);
      if (errors.length > 0) {
        setLoadError(
          errors.length === gallery.length
            ? "Could not load gallery images. Check your connection and try again."
            : `Some images failed to load (${errors.length}/${gallery.length}).`,
        );
      } else {
        setLoadError(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(gallery.map((m) => m.mediaId))]);

  if (gallery.length === 0) return null;

  return (
    <>
      <section aria-labelledby="media-heading" className="dish-gallery">
        <div className="sec-rule">
          <h2 id="media-heading">Gallery</h2>
        </div>

        {loadError && (
          <div role="status" className="dish-gallery__banner">
            {loadError}
          </div>
        )}

        <ul className="dish-gallery__grid">
          {gallery.map((m) => {
            const url = galleryUrls[m.mediaId];
            return (
              <li key={m.attachmentId}>
                <button
                  type="button"
                  className="dish-gallery__thumb"
                  onClick={() => setLightbox(m)}
                  aria-label={`Open larger view${m.altText ? `: ${m.altText}` : ""}`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={m.altText ?? "Gallery image"}
                      loading="lazy"
                      decoding="async"
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

      {lightbox &&
        (() => {
          const url = galleryUrls[lightbox.mediaId];
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Full-size view of ${lightbox.altText ?? "image"}`}
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
              {url && (
                <img
                  src={url}
                  alt={lightbox.altText ?? "Full-size image"}
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
  return "unknown";
}
