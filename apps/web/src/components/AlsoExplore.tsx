import type { DishCategory, DishPreparation } from '../types/dish';

// ---------------------------------------------------------------------------
// "You may also explore" — a small static module that links out to the
// dish-list page with filters pre-applied, so a visitor can pivot from a
// single dish to its broader cluster in one click.
//
// We render this server-side (no island needed) because it's pure
// link-list UI with no interactivity. The categories + preparations are
// already passed to DishDetail from the API, so we don't need a fetch.
// ---------------------------------------------------------------------------

export interface AlsoExploreProps {
  categories: DishCategory[];
  preparations: DishPreparation[];
  originName: string | null;
}

interface ExploreLink {
  href: string;
  label: string;
  meta: string;
  tone: 'cuisine' | 'method' | 'region';
}

export function AlsoExplore({ categories, preparations, originName }: AlsoExploreProps) {
  const links: ExploreLink[] = [];

  // Top 2 categories by relevance — primary category first, then most
  // interesting secondary one (skip the dish-type slugs that match the
  // preparation method below to avoid duplicates).
  const primary = categories.find((c) => c.isPrimary) ?? categories[0];
  const secondary = categories.find((c) => c !== primary) ?? null;
  for (const c of [primary, secondary].filter(Boolean) as DishCategory[]) {
    links.push({
      href: `/dishes?category=${encodeURIComponent(c.slug)}`,
      label: c.name,
      meta: 'Same category',
      tone: 'cuisine',
    });
  }

  // Top 1 preparation method (e.g. dumpling, rice-dish, stir-fry).
  const method = preparations[0];
  if (method) {
    links.push({
      href: `/dishes?technique=${encodeURIComponent(method.methodSlug)}`,
      label: method.methodName,
      meta: 'Same cooking method',
      tone: 'method',
    });
  }

  // Region / origin
  if (originName) {
    links.push({
      href: `/dishes?region=${encodeURIComponent(originName)}`,
      label: originName,
      meta: 'Same region',
      tone: 'region',
    });
  }

  if (links.length === 0) return null;

  return (
    <aside className="also-explore" aria-label="You may also explore">
      <p className="mono-sub">You may also explore</p>
      <ul>
        {links.map((l, i) => (
          <li key={`${l.tone}-${i}`} data-tone={l.tone}>
            <a href={l.href}>
              <span className="ae-meta">{l.meta}</span>
              <span className="ae-label">{l.label}</span>
              <span className="ae-go">→</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}