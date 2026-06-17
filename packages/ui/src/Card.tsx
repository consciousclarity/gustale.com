import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'article' | 'section' | 'aside';
  padded?: boolean;
}

/**
 * Plain surface card. Use as the base for tiles, dish cards, etc.
 * Variants are intended to be added later (borderless, elevated, etc.)
 * once we know what the design system actually needs.
 */
export function Card({
  as: Tag = 'div',
  padded = true,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={
        'rounded-lg border border-slate-200 bg-white shadow-sm ' +
        (padded ? 'p-4 ' : '') +
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
}

export function DishCard({
  title,
  description,
  href,
  status,
  viewCount,
}: DishCardProps) {
  return (
    <Card className="transition hover:border-emerald-300 hover:shadow-md">
      <a href={href} className="block">
        <h3 className="text-lg font-semibold text-slate-900 hover:text-emerald-700">
          {title}
        </h3>
        {description && (
          <p className="mt-1 line-clamp-3 text-sm text-slate-600">{description}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          {status && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">
              {status}
            </span>
          )}
          {typeof viewCount === 'number' && (
            <span>{viewCount.toLocaleString()} views</span>
          )}
        </div>
      </a>
    </Card>
  );
}
