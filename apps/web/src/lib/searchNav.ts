/**
 * Pure helpers for GlobalSearch + Nav (U0-B).
 * Domain is passed explicitly so Node tests can run without Vite.
 */

import {
  ATLAS_ORIGIN,
  RECIPES_ORIGIN,
  isRecipesOnlyPath,
  type GustaleDomain,
} from './domain';

export type SearchPlacement = 'header' | 'drawer';

export type BrowseLink = { href: string; label: string };

/** True for the dishes *index* (`/dishes`), not `/dishes/<slug>`. */
export function isDishesIndexPath(path: string): boolean {
  const bare = (path.split('?')[0] ?? path).replace(/\/+$/, '') || '/';
  return bare === '/dishes';
}

/**
 * Rewrite a search-hit href for the current domain.
 * On Atlas: recipes-only paths and the dishes *list* become absolute Recipes URLs.
 * Dish detail (`/dishes/<slug>`) stays local (retained in geo dist).
 * Query strings are preserved.
 */
export function resolveSearchHitHref(
  href: string,
  domain: GustaleDomain,
): string {
  try {
    let pathOnly: string;
    let qs = '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const u = new URL(href);
      pathOnly = u.pathname;
      qs = u.search;
    } else {
      const qIdx = href.indexOf('?');
      pathOnly = qIdx >= 0 ? href.slice(0, qIdx) : href;
      qs = qIdx >= 0 ? href.slice(qIdx) : '';
    }

    if (domain !== 'geo') return href;

    if (isRecipesOnlyPath(pathOnly) || isDishesIndexPath(pathOnly)) {
      const p = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
      return `${RECIPES_ORIGIN}${p}${qs}`;
    }
    return href;
  } catch {
    return href;
  }
}

/** “See all dish matches” — never local `/dishes` on Atlas (list index removed). */
export function seeAllDishesHref(query: string, domain: GustaleDomain): string {
  const qs = `?q=${encodeURIComponent(query)}`;
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes${qs}`;
  return `/dishes${qs}`;
}

/** Stable, placement-scoped option id (header + drawer must not collide). */
export function searchOptionId(
  placement: SearchPlacement,
  groupType: string,
  slug: string,
): string {
  const safeType = groupType.replace(/[^a-z0-9_-]/gi, '');
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '-') || 'item';
  return `gs-opt-${placement}-${safeType}-${safeSlug}`;
}

/** Clamp keyboard active index into [0, count) (or 0 when empty). */
export function clampActiveIndex(activeIdx: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(activeIdx)) return 0;
  if (activeIdx < 0) return 0;
  if (activeIdx >= count) return count - 1;
  return activeIdx;
}

/** Initial/help browse links when query length < 2. */
export function searchHelpLinks(domain: GustaleDomain): BrowseLink[] {
  if (domain === 'geo') {
    return [
      { href: '/', label: 'Globe' },
      { href: '/regions', label: 'Countries' },
      { href: '/families', label: 'Food families' },
      { href: '/lineages', label: 'Lineages' },
      { href: `${RECIPES_ORIGIN}/dishes`, label: 'Browse recipes' },
    ];
  }
  return [
    { href: '/dishes', label: 'Recipes' },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/families', label: 'Food families' },
    { href: '/lineages', label: 'Lineages' },
    { href: `${ATLAS_ORIGIN}/`, label: 'Browse Atlas' },
  ];
}

/** Empty-state alternate browse links. */
export function searchEmptyBrowseLinks(domain: GustaleDomain): BrowseLink[] {
  return searchHelpLinks(domain);
}

/**
 * API/network failure fallback links.
 * Atlas keeps Countries / Food families / Lineages + absolute Browse recipes.
 * Recipes may use local /dishes and /ingredients.
 */
export function searchErrorBrowseLinks(domain: GustaleDomain): BrowseLink[] {
  if (domain === 'geo') {
    return [
      { href: '/regions', label: 'Countries' },
      { href: '/families', label: 'Food families' },
      { href: '/lineages', label: 'Lineages' },
      { href: `${RECIPES_ORIGIN}/dishes`, label: 'Browse recipes' },
    ];
  }
  return [
    { href: '/dishes', label: 'Recipes' },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/families', label: 'Food families' },
    { href: '/lineages', label: 'Lineages' },
    { href: `${ATLAS_ORIGIN}/`, label: 'Browse Atlas' },
  ];
}

/** Aria-live status copy for search panel states. */
export function searchStatusMessage(opts: {
  open: boolean;
  queryLen: number;
  loading: boolean;
  unavailable: boolean;
  resultCount: number | null;
  query: string;
}): string {
  const { open, queryLen, loading, unavailable, resultCount, query } = opts;
  if (!open) return '';
  if (queryLen < 2) {
    return 'Type at least two characters to search. Browse links are available below.';
  }
  if (loading) return 'Searching…';
  if (unavailable) return 'Search is temporarily unavailable.';
  if (resultCount === 0) {
    return `No results for “${query}”.`;
  }
  if (resultCount != null && resultCount > 0) {
    return `${resultCount} result${resultCount === 1 ? '' : 's'} available.`;
  }
  return '';
}

/**
 * Primary-nav active match — mirrors Nav.astro match functions.
 * Used for static aria-current and for tests.
 */
export function isPrimaryNavActive(
  href: string,
  pathname: string,
  domain: GustaleDomain,
): boolean {
  const p = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  if (domain === 'geo') {
    if (href === '/') return p === '/' || p === '';
    if (href === '/regions') return p === '/regions' || p.startsWith('/regions/');
    if (href === '/families') {
      return (
        p === '/families'
        || p.startsWith('/families/')
        || p === '/family'
        || p.startsWith('/family/')
      );
    }
    if (href === '/lineages') {
      return p === '/lineages' || p.startsWith('/lineages/');
    }
    if (href === '/about') return p === '/about' || p.startsWith('/about/');
    return p === href || p.startsWith(`${href}/`);
  }

  // Recipes
  if (href === '/dishes') {
    return p === '/dishes' || p.startsWith('/dishes/');
  }
  if (href === '/ingredients') {
    return p === '/ingredients' || p.startsWith('/ingredients/');
  }
  if (href === '/families') {
    return (
      p === '/families'
      || p.startsWith('/families/')
      || p === '/family'
      || p.startsWith('/family/')
    );
  }
  if (href === '/lineages') {
    return p === '/lineages' || p.startsWith('/lineages/');
  }
  if (href === '/about') return p === '/about' || p.startsWith('/about/');
  return p === href || p.startsWith(`${href}/`);
}

/** Add-a-dish CTA href for a given domain. */
export function addDishHref(domain: GustaleDomain): string {
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes/new`;
  return '/dishes/new';
}

/** Whether “/” should focus header search (ignore editable / form fields). */
export function shouldHandleSlashShortcut(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return true;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (el.isContentEditable) return false;
  if (el.closest('[contenteditable="true"], [contenteditable=""]')) return false;
  // Don't steal “/” from focused buttons that might be part of another widget.
  if (tag === 'BUTTON' || el.closest('button')) return false;
  return true;
}
