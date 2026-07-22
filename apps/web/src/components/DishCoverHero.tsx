import { useEffect, useState } from 'react';
import { getMediaSignedUrl } from '../lib/api';
import type { DishMediaAttachment, DishOrigin } from '../types/dish';

export interface DishCoverHeroProps {
  dishName: string;
  origin: DishOrigin | null;
  media: DishMediaAttachment[];
}

/**
 * Full-bleed cover for dish pages.
 *
 * Always paints a finished hero — never "Loading cover…".
 * - With cover media: fetch signed URL, fade image in over the fallback.
 * - Without media / on error: keep the typographic origin composition.
 */
export function DishCoverHero({ dishName, origin, media }: DishCoverHeroProps) {
  const cover =
    media.find((m) => m.role === 'cover') ??
    [...media].sort((a, b) => a.position - b.position)[0] ??
    null;

  const [url, setUrl] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const placeLabel = origin?.name ?? 'Origin unrecorded';
  const placeCode = (origin?.isoCode ?? origin?.name ?? '—').toString().toUpperCase();

  useEffect(() => {
    if (!cover) {
      setUrl(null);
      setImageReady(false);
      return;
    }

    let cancelled = false;
    setUrl(null);
    setImageReady(false);

    void (async () => {
      try {
        const res = await getMediaSignedUrl(cover.mediaId);
        if (!cancelled) setUrl(res.url);
      } catch {
        if (!cancelled) {
          setUrl(null);
          setImageReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cover?.mediaId]);

  return (
    <figure className="dish-cover-hero">
      <div className="dish-cover-hero__frame">
        {/* Always-present fallback — typographic place mark, never a spinner */}
        <div className="dish-cover-hero__fallback" aria-hidden={imageReady}>
          <div className="dish-cover-hero__fallback-inner">
            <span className="dish-cover-hero__code">{placeCode}</span>
            <span className="dish-cover-hero__place">{placeLabel}</span>
            <span className="dish-cover-hero__name">{dishName}</span>
          </div>
        </div>

        {url && (
          <img
            src={url}
            alt={cover?.altText ?? `${dishName} — cover`}
            className={`dish-cover-hero__img${imageReady ? ' is-ready' : ''}`}
            decoding="async"
            fetchPriority="high"
            onLoad={() => setImageReady(true)}
            onError={() => {
              setUrl(null);
              setImageReady(false);
            }}
          />
        )}

        <div className="dish-cover-hero__veil" />
      </div>

      <figcaption className="dish-cover-hero__cap">
        <span>
          {cover
            ? cover.altText || cover.credit || 'Cover photograph'
            : 'Cover pending — place mark shown until a photo is attached'}
        </span>
        <span className="dish-cover-hero__cap-meta">
          {cover?.credit && <em>{cover.credit}</em>}
          {cover?.license && <span className="dish-cover-hero__license">{cover.license}</span>}
          {!cover && <span className="dish-cover-hero__license">{placeCode}</span>}
        </span>
      </figcaption>
    </figure>
  );
}
