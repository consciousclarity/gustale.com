import type * as React from "react";

/**
 * A dish's cover image, as the API returns it for the list.
 *
 * `variantsUrls` is keyed by width ("800", "1536") so the front-end
 * can build a srcset. `publicUrl` is the largest variant and is the
 * fallback for a browser without srcset support.
 *
 * It is declared here rather than imported from the web app so the
 * UI package stays independent of the app that consumes it.
 */
export interface DishCover {
  publicUrl: string;
  variantsUrls: Record<string, string>;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "article" | "section" | "aside";
  padded?: boolean;
}

/**
 * Plain surface card. Use as the base for tiles, dish cards, etc.
 * Variants are intended to be added later (borderless, elevated, etc.)
 * once we know what the design system actually needs.
 */
export function Card({
  as: Tag = "div",
  padded = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={
        "rounded-lg border border-slate-200 bg-white shadow-sm " +
        (padded ? "p-4 " : "") +
        className
      }
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface DishCardProps {
  title: string;
  slug: string;
  description?: string | null;
  href: string;
  status?: string;
  viewCount?: number;
  /**
   * The cover image for the card, when the dish has one.
   *
   * When it is absent the card shows a neutral placeholder — a
   * typographic mark of the dish's origin, never a broken image and
   * never an empty box.
   */
  cover?: DishCover | null;
  /**
   * The heading level for the dish's name.
   *
   * WHY THIS IS A PROP
   *
   * A card title is a heading, and a heading has a LEVEL that has to
   * fit the document it is in. It used to be hardcoded to <h3>, which
   * is right when the cards sit under an <h2> — and wrong when they
   * sit directly under the page's <h1>, because that skips a level.
   *
   * A skipped level is not a cosmetic problem. A screen-reader user
   * navigating by heading sees a list that jumps from the page title
   * straight past a level, and the structure they are reading is no
   * longer the structure of the document.
   *
   * The default stays <h3>, because that is the level the card was
   * written for. The caller passes the level that matches ITS page.
   */
  headingLevel?: "h2" | "h3" | "h4";
}

function buildSrcSet(variantsUrls: Record<string, string>): string | undefined {
  const entries: string[] = [];
  for (const [width, url] of Object.entries(variantsUrls)) {
    if (typeof url === "string" && url.length > 0) {
      entries.push(`${url} ${width}w`);
    }
  }
  return entries.length > 0 ? entries.join(", ") : undefined;
}

/**
 * The card's thumbnail: the cover image, or a neutral placeholder.
 *
 * The image is LAZY-loaded. A browse page can carry dozens of cards,
 * and none of them is above the fold in any meaningful sense — the
 * browser should not fetch forty images to render a screenful. The
 * placeholder is always in the DOM underneath, so there is never a
 * flash of empty space and never a broken-image icon.
 */
function DishCardThumb({
  cover,
  title,
}: {
  cover?: DishCover | null;
  title: string;
}) {
  const srcSet = cover ? buildSrcSet(cover.variantsUrls) : undefined;
  const alt = cover?.altText?.trim() || `${title} — cover`;

  if (!cover) {
    return (
      <div
        className="dish-card-thumb dish-card-thumb--placeholder"
        // The placeholder carries the dish's name as text, so it is
        // meaningful content, not decoration.
        role="img"
        aria-label={`${title} — no photograph yet`}
      >
        <span className="dish-card-thumb__initials" aria-hidden="true">
          {title.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="dish-card-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.publicUrl}
        srcSet={srcSet}
        // The card is a third of a grid column on a desktop and full
        // width on a phone. The 800w variant covers both without the
        // browser pulling the 1536w one down.
        sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
        alt={alt}
        className="dish-card-thumb__img"
        loading="lazy"
        decoding="async"
        // Explicit dimensions reserve the space so the list does not
        // jump as the images arrive. The stored dimensions are the
        // source image's, so the ratio is right; the CSS clamps the
        // rendered box to a fixed aspect.
        width={cover.width ?? undefined}
        height={cover.height ?? undefined}
      />
    </div>
  );
}

export function DishCard({
  title,
  description,
  href,
  status,
  viewCount,
  cover,
  headingLevel = "h3",
}: DishCardProps) {
  const Heading = headingLevel;
  return (
    <Card className="transition hover:border-emerald-300 hover:shadow-md">
      <a href={href} className="block">
        <DishCardThumb cover={cover} title={title} />
        <Heading className="text-lg font-semibold text-slate-900 hover:text-emerald-700">
          {title}
        </Heading>
        {description && (
          <p className="mt-1 line-clamp-3 text-sm text-slate-600">
            {description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          {status && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">
              {status}
            </span>
          )}
          {typeof viewCount === "number" && (
            <span>{viewCount.toLocaleString()} views</span>
          )}
        </div>
      </a>
    </Card>
  );
}
