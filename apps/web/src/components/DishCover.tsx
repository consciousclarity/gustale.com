/**
 * THE COVER — a 4:3 photograph beside the dish's title.
 *
 * WHY THIS REPLACED THE FULL-BLEED HERO
 *
 * The dish page used to open with a full-bleed cover, 720px tall, and
 * the photograph sat in a dark frame until the page's JavaScript had
 * run. Measured on the live site on 2026-11-19, a cold load at 390px
 * left the dark frame on screen for 2.5 seconds, and at 1440px for
 * 1.25 seconds — long enough that the page reads as "the photograph is
 * missing" rather than "the photograph is arriving".
 *
 * Two things caused it:
 *
 *   1. The frame was a typographic FALLBACK painted dark, and the
 *      photograph only covered it once the island had hydrated.
 *
 *   2. The hero's `sizes` said "100vw" on mobile, so a 390px screen
 *      with a 3x display asked for 1170px of image and downloaded the
 *      1536w file — 220KB — to paint a frame that was never more than
 *      62vw wide.
 *
 * The fix is not a faster fade. It is a different layout: the
 * photograph is a 4:3 image BESIDE the title, in the flow of the
 * Overview section, with a `sizes` that describes the box it actually
 * occupies. There is no dark full-bleed frame to wait for, so there is
 * nothing to wait for.
 *
 * THE IMAGE IS VISIBLE AS SOON AS IT IS PAINTED
 *
 * There is no `opacity: 0` and no class that gates the visibility. The
 * `is-ready` class, which existed only to settle a scale animation,
 * is gone: the animation is worth less than the certainty, and a
 * photograph that is half-faded for a second reads as broken.
 *
 * THE PLACE MARK IS NOT A DARK BLOCK
 *
 * When a dish has no photograph, the placeholder is the dish's own
 * name on the page's own paper colour. It is a placeholder, not a
 * hero.
 */

import { stripUrls } from "../lib/creditText";
import { selectDishHeroMedia } from "../lib/dishMedia";
import type { DishMediaAttachment, DishOrigin } from "../types/dish";

export interface DishCoverProps {
  dishName: string;
  origin: DishOrigin | null;
  media: DishMediaAttachment[];
}

/**
 * The `sizes` for the cover image.
 *
 * The cover is a 4:3 box beside the title. On a wide screen it takes
 * roughly half the content width; on a narrow screen it is the full
 * content width.
 */
const COVER_SIZES = "(min-width: 1100px) 480px, (min-width: 720px) 42vw, 92vw";

/**
 * The phone breakpoint, shared by the `<picture>` media query and the
 * `sizes` below.
 */
const PHONE_MAX_WIDTH = 719;

export function DishCover({ dishName, origin, media }: DishCoverProps) {
  const cover = selectDishHeroMedia(media);
  const placeLabel = origin?.name ?? "";
  const placeCode = (origin?.isoCode ?? origin?.name ?? "—")
    .toString()
    .toUpperCase();

  const imgSrc = cover?.publicUrl ?? null;
  const srcSet = buildSrcSet(cover?.variantsUrls);
  const phoneSet = phoneSrcSet(cover?.variantsUrls);
  const width = cover?.width ?? null;
  const height = cover?.height ?? null;
  const alt = cover?.altText ?? `${dishName} — cover`;
  const creditText = cover?.credit ? stripUrls(cover.credit) : null;

  return (
    <figure className="dish-cover">
      <div className="dish-cover__frame">
        {imgSrc ? (
          <picture>
            {/* A phone gets the 800w file and nothing else, at any
                pixel ratio. See phoneSrcSet() for why a plain srcset
                cannot promise that. */}
            {phoneSet ? (
              <source
                media={`(max-width: ${PHONE_MAX_WIDTH}px)`}
                srcSet={phoneSet}
                sizes="100vw"
              />
            ) : null}
            {srcSet ? <source srcSet={srcSet} sizes={COVER_SIZES} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              srcSet={srcSet}
              sizes={srcSet !== undefined ? COVER_SIZES : undefined}
              alt={alt}
              className="dish-cover__img"
              // The cover is above the fold: load it eagerly and let the
              // browser treat it as the LCP image.
              loading="eager"
              fetchPriority="high"
              decoding="async"
              {...(width ? { width } : {})}
              {...(height ? { height } : {})}
            />
          </picture>
        ) : (
          // No photograph: the place mark, on paper. Never a dark
          // full-bleed block.
          <div className="dish-cover__mark" aria-hidden="true">
            <span className="dish-cover__code">{placeCode}</span>
            {placeLabel ? (
              <span className="dish-cover__place">{placeLabel}</span>
            ) : null}
            <span className="dish-cover__name">{dishName}</span>
          </div>
        )}
      </div>

      <figcaption className="dish-cover__cap">
        <span>
          {cover
            ? cover.altText || creditText || "Cover photograph"
            : "Cover pending — the dish's place mark is shown until a photo is attached"}
        </span>
        <span className="dish-cover__cap-meta">
          {creditText && <em>{creditText}</em>}
          {cover?.license && (
            <span className="dish-cover__license">{cover.license}</span>
          )}
          {!cover && <span className="dish-cover__license">{placeCode}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The phone source: the 800w file, and nothing else.
 *
 * The owner asked for the 800w version on mobile. A plain `srcset`
 * cannot promise that: the browser multiplies the `sizes` width by the
 * device pixel ratio, and a 390px phone at 3x asks for more than 800
 * device pixels, so it takes the 1536w file. Measured on 2026-11-19,
 * a 3x phone did exactly that.
 *
 * A `<picture>` with a `media`-scoped source is the way to cap it: the
 * phone branch offers ONLY the 800w file, so there is nothing larger
 * to choose, at any pixel ratio. The wide branch keeps the full
 * `srcset`, where picking the big file is correct.
 */
function phoneSrcSet(
  variantsUrls: Record<string, string> | undefined,
): string | undefined {
  if (!variantsUrls) return undefined;
  const url = variantsUrls["800"] ?? variantsUrls["800w"];
  return url ? `${url} 800w` : undefined;
}

/**
 * Build an `<img srcset>` string from a `{width: publicUrl}` map.
 *
 * The widths are sorted numerically, not alphabetically: "1536" sorts
 * before "800" as a string, and a srcset whose entries are out of
 * order is still valid but reads as a mistake in the markup.
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
  entries.sort(
    (a, b) =>
      Number(a.split(" ")[1].replace("w", "")) -
      Number(b.split(" ")[1].replace("w", "")),
  );
  return entries.join(", ");
}
