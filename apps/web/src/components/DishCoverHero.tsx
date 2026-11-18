import { useEffect, useRef } from "react";
import { stripUrls } from "../lib/creditText";
import { selectDishHeroMedia } from "../lib/dishMedia";
import type { DishMediaAttachment, DishOrigin } from "../types/dish";

export interface DishCoverHeroProps {
  dishName: string;
  origin: DishOrigin | null;
  media: DishMediaAttachment[];
}

/**
 * Full-bleed cover for dish pages.
 *
 * Build-time render: the API bakes the same-origin public URL into
 * each media row (`publicUrl` + `variantsUrls`), so this component
 * paints a real `<img src=...>` directly from the static HTML —
 * no signed-URL fetch, no spinner.
 *
 * Selection matches `selectDishHeroMedia` — gallery must exclude that
 * mediaId.
 */
export function DishCoverHero({ dishName, origin, media }: DishCoverHeroProps) {
  const cover = selectDishHeroMedia(media);
  // WP-B2. "Origin unrecorded" is gone — the blueprint's rule is that
  // no dish has an "Origin" field in the UI. This fallback block is
  // the no-photograph placeholder, so when there is no associated
  // place it shows the dish's own name and its code, and no place
  // line at all.
  const placeLabel = origin?.name ?? "";
  const placeCode = (origin?.isoCode ?? origin?.name ?? "—")
    .toString()
    .toUpperCase();

  // THE SETTLE — an ENHANCEMENT, never a gate.
  //
  // The photograph is VISIBLE AS SOON AS IT IS PAINTED: the CSS says
  // `opacity: 1`, and that is what makes the photograph appear. It used
  // to say `opacity: 0` and wait for an `is-ready` class that NOTHING
  // EVER ADDED, so the image loaded, the browser decoded it, and the
  // reader still saw a 720px dark block. The 2026-11-15 blueprint
  // recorded it as "the cover photo stays invisible".
  //
  // What this effect does is settle the 1.02 scale to 1.0 once the
  // image has decoded. That is a flourish, not a gate: if the effect
  // never runs — no JavaScript, a blocked script, a slow parser — the
  // photograph is STILL THERE. Only the scale settles late.
  //
  // The `complete` check matters: on a warm cache the image has
  // already decoded by the time this runs, the `load` event has fired
  // and will NOT fire again, and a handler that only listened for
  // `load` would leave the scale at 1.02 forever.
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const settle = () => img.classList.add("is-ready");

    if (img.complete && img.naturalWidth > 0) {
      // Already decoded — the warm-cache path.
      settle();
      return;
    }
    img.addEventListener("load", settle, { once: true });
    return () => img.removeEventListener("load", settle);
  }, []);

  // Resolve the image URLs from the API shape. We render the
  // <picture>/<img> tag with a srcset built from variantsUrls (e.g.
  // "800w" and "1536w") when the row has them, falling back to the
  // single publicUrl otherwise. This is purely build-time data; no
  // client-side fetch is performed.
  const imgSrc = cover?.publicUrl ?? null;
  const srcSet = buildSrcSet(cover?.variantsUrls);
  const sizes =
    srcSet !== undefined
      ? // The hero is full-bleed; the 1536w is fine on every viewport
        // at our 200KB target, so we only ask the browser to consider
        // a 2x density for high-DPR displays. Browsers without
        // srcset support fall through to `src`.
        "(min-width: 1024px) 1024px, 100vw"
      : undefined;
  const width = cover?.width ?? null;
  const height = cover?.height ?? null;
  const alt = cover?.altText ?? `${dishName} — cover`;

  // The caption prints the credit as TEXT, not as a wall of URLs. The
  // stored credit is one string with the URLs inside parentheses --
  // "Michael Hays (https://www.flickr.com/photos/...) — Flickr
  // (https://...) via Wikimedia Commons (https://...)" -- and printing
  // it verbatim produced a 553px-wide run of text at a 390px viewport,
  // which is the horizontal overflow the 2026-11-15 blueprint recorded.
  // The names are the information; the URLs are behind them.
  const creditText = cover?.credit ? stripUrls(cover.credit) : null;

  return (
    <figure className="dish-cover-hero">
      <div className="dish-cover-hero__frame">
        {/* Always-present fallback — typographic place mark, never a
            spinner. The <img> renders on top of it and is VISIBLE AS
            SOON AS IT IS PAINTED: the photograph is not gated on a
            load event, a hydration pass or a class toggle. The
            `is-ready` class is an enhancement that only settles the
            1.02 scale; if it never arrives, the photograph is still
            there. */}
        <div
          className="dish-cover-hero__fallback"
          aria-hidden={Boolean(imgSrc)}
        >
          <div className="dish-cover-hero__fallback-inner">
            <span className="dish-cover-hero__code">{placeCode}</span>
            {placeLabel ? (
              <span className="dish-cover-hero__place">{placeLabel}</span>
            ) : null}
            <span className="dish-cover-hero__name">{dishName}</span>
          </div>
        </div>

        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={imgSrc}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            className="dish-cover-hero__img"
            // The hero image is above the fold; load it eagerly.
            loading="eager"
            // Browser prioritises the LCP image.
            fetchPriority="high"
            decoding="async"
            // Width/height set from the API's stored dimensions (when
            // known) so the browser reserves the right amount of
            // vertical space and prevents layout shift.
            {...(width ? { width } : {})}
            {...(height ? { height } : {})}
          />
        ) : null}

        <div className="dish-cover-hero__veil" />
      </div>

      <figcaption className="dish-cover-hero__cap">
        <span>
          {cover
            ? cover.altText || creditText || "Cover photograph"
            : "Cover pending — place mark shown until a photo is attached"}
        </span>
        <span className="dish-cover-hero__cap-meta">
          {creditText && <em>{creditText}</em>}
          {cover?.license && (
            <span className="dish-cover-hero__license">{cover.license}</span>
          )}
          {!cover && (
            <span className="dish-cover-hero__license">{placeCode}</span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Build an `<img srcset>` string from a `{width: publicUrl}` map.
 *
 * Width keys in the API are nominal ("800", "1536") and the public
 * URL is fully qualified (or, since it lives in `gustale-public` and
 * Caddy serves it, the API returns same-origin relative paths).
 * The srcset descriptor `800w` and `1536w` is what the browser
 * uses to pick the closest match.
 *
 * Returns `undefined` if there are no variants — the caller falls
 * back to a plain `<img src>` with no srcset.
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
