import type * as React from "react";

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

export function DishCard({
  title,
  description,
  href,
  status,
  viewCount,
  headingLevel = "h3",
}: DishCardProps) {
  const Heading = headingLevel;
  return (
    <Card className="transition hover:border-emerald-300 hover:shadow-md">
      <a href={href} className="block">
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
