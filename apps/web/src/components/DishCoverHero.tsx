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
 * no `useEffect`, no signed-URL fetch, no spinner.
 *
 * Selection matches `selectDishHeroMedia` — gallery must exclude that
 * mediaId.
 */
export function DishCoverHero({ dishName, origin, media }: DishCoverHeroProps) {
  const cover = selectDishHeroMedia(media);
  const placeLabel = origin?.name ?? "Origin unrecorded";
  const placeCode = (origin?.isoCode ?? origin?.name ?? "—")
    .toString()
    .toUpperCase();

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

  return (
    <figure className="dish-cover-hero">
      <div className="dish-cover-hero__frame">
        {/* Always-present fallback — typographic place mark, never a
            spinner. The <img> renders on top with opacity 0, fades
            in when the browser reports a successful load. For SSR
            builds the <img> is the real source so crawlers + first
            byte see the actual image. */}
        <div className="dish-cover-hero__fallback" aria-hidden={Boolean(imgSrc)}>
          <div className="dish-cover-hero__fallback-inner">
            <span className="dish-cover-hero__code">{placeCode}</span>
            <span className="dish-cover-hero__place">{placeLabel}</span>
            <span className="dish-cover-hero__name">{dishName}</span>
          </div>
        </div>

        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
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
            ? cover.altText || cover.credit || "Cover photograph"
            : "Cover pending — place mark shown until a photo is attached"}
        </span>
        <span className="dish-cover-hero__cap-meta">
          {cover?.credit && <em>{cover.credit}</em>}
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
