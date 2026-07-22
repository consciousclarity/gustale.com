/**
 * Gustale — navigation configuration (single source of truth).
 *
 * Every nav link, the property switcher, and the search seed rows are
 * defined here so the header markup (SiteHeader.astro) and the two
 * interactive islands (NavSearch, MobileNav) all read from one typed
 * config instead of hardcoding <a> lists.
 *
 * Domain detection follows the established pattern:
 *   const domain = import.meta.env.PUBLIC_DOMAIN ?? 'recipes';
 *   const isGeo = domain === 'geo';
 *
 * The two domains are framed as two reading rooms of one library
 * ("Atlas" = gustale.com / geo, "Recipes" = gustale.recipes), not two
 * SaaS products.
 *
 * TODO: dark mode — the design system is light-only (color-scheme: light
 * in global.css). No toggle in v1.
 */

export type Domain = 'geo' | 'recipes';

export interface NavLink {
  /** Visible label — reads like a chapter name, not a feature link. */
  label: string;
  /** Path relative to the current domain root. */
  href: string;
  /**
   * How to compute the active state against the current pathname.
   *  - 'exact'  : only this exact path (used for the Atlas "/" home link)
   *  - 'prefix' : this path and anything under it
   */
  match: 'exact' | 'prefix';
  /**
   * Placeholder route that does not exist yet. Rendered with
   * aria-disabled="true" and no href. None in v1 — kept for future IA.
   */
  soon?: boolean;
}

export interface PropertyRef {
  /** "Atlas" or "Recipes". */
  label: string;
  /** Bare host, shown as the quiet meta line. */
  host: string;
  /** Absolute cross-domain URL (cross-domain jumps are never relative). */
  href: string;
  /** One-line editorial description. */
  description: string;
}

export interface SearchRow {
  group: string;
  label: string;
  meta: string;
  href: string;
}

export interface NavConfig {
  domain: Domain;
  isGeo: boolean;
  /** Small badge next to the wordmark: which reading room you're in. */
  brandSub: string;
  /** Primary section links — the table of contents for this property. */
  primary: NavLink[];
  /** The property you are currently reading. */
  current: PropertyRef;
  /** The quieter sibling property you can switch to. */
  other: PropertyRef;
  /**
   * Seasonal editorial placeholders rotated through the search input.
   * Picked client-side so the chrome reads like a card catalog prompt.
   */
  searchPrompts: string[];
  /** Empty-state suggested searches shown beneath the input. */
  searchSuggestions: string[];
  /**
   * Seed rows for the search overlay. There is no live search API wired
   * yet — these stand in and are filtered client-side.
   * TODO(api): wire to /api/dishes?q=... once the search endpoint is stable.
   */
  searchSeed: SearchRow[];
}

const ATLAS: PropertyRef = {
  label: 'Atlas',
  host: 'gustale.com',
  href: 'https://gustale.com/',
  description: 'The world, dish by dish',
};

const RECIPES: PropertyRef = {
  label: 'Recipes',
  host: 'gustale.recipes',
  href: 'https://gustale.recipes/',
  description: 'A living culinary archive',
};

/** Atlas (geo) — "The Atlas". Sections read like chapters. */
const GEO_PRIMARY: NavLink[] = [
  { label: 'Atlas', href: '/', match: 'exact' },
  { label: 'Families', href: '/families', match: 'prefix' },
  { label: 'Lineages', href: '/lineages', match: 'prefix' },
  { label: 'Map', href: '/map', match: 'prefix' },
];

/** Recipes — "The Encyclopedia". Recipes leads (entry point here). */
const RECIPES_PRIMARY: NavLink[] = [
  { label: 'Recipes', href: '/dishes', match: 'prefix' },
  { label: 'Families', href: '/families', match: 'prefix' },
  { label: 'Lineages', href: '/lineages', match: 'prefix' },
];

const GEO_SEARCH: SearchRow[] = [
  { group: 'Dishes', label: 'Khachapuri', meta: 'Georgia', href: '/dishes/khachapuri' },
  { group: 'Dishes', label: 'Pho', meta: 'Vietnam', href: '/dishes/pho' },
  { group: 'Families', label: 'Egg dishes', meta: 'Family', href: '/families' },
  { group: 'Lineages', label: 'The lineage of pizza', meta: 'Lineage', href: '/lineages' },
  { group: 'Places', label: 'Morocco', meta: 'Atlas', href: '/map' },
];

const RECIPES_SEARCH: SearchRow[] = [
  { group: 'Dishes', label: 'Tagine', meta: 'Morocco', href: '/dishes/tagine' },
  { group: 'Dishes', label: 'Shakshuka', meta: 'Maghreb / Levant', href: '/dishes/shakshuka' },
  { group: 'Families', label: 'Soups & broths', meta: 'Family', href: '/families' },
  { group: 'Lineages', label: 'The lineage of pizza', meta: 'Lineage', href: '/lineages' },
];

const GEO_PROMPTS = [
  'Map a region',
  'Trace a lineage',
  'Find a dish',
  'Looking for a soup?',
];

const RECIPES_PROMPTS = [
  'Looking for a soup?',
  'Find an ingredient',
  'Trace a lineage',
  'A dish from Morocco',
];

const GEO_SUGGESTIONS = [
  'A dish from Morocco',
  'Soups of West Africa',
  'The lineage of pizza',
];

const RECIPES_SUGGESTIONS = [
  'A dish from Morocco',
  'Soups of West Africa',
  'The lineage of pizza',
];

/**
 * Build the nav config for a domain. Call with the resolved isGeo flag
 * from the Astro layer.
 */
export function getNavConfig(isGeo: boolean): NavConfig {
  return {
    domain: isGeo ? 'geo' : 'recipes',
    isGeo,
    brandSub: isGeo ? 'Atlas' : 'Recipes',
    primary: isGeo ? GEO_PRIMARY : RECIPES_PRIMARY,
    current: isGeo ? ATLAS : RECIPES,
    other: isGeo ? RECIPES : ATLAS,
    searchPrompts: isGeo ? GEO_PROMPTS : RECIPES_PROMPTS,
    searchSuggestions: isGeo ? GEO_SUGGESTIONS : RECIPES_SUGGESTIONS,
    searchSeed: isGeo ? GEO_SEARCH : RECIPES_SEARCH,
  };
}

/**
 * Active-state test for a nav link against the current pathname.
 * Exact links match only themselves; prefix links match descendants.
 * Trailing slashes are normalised so "/families/" === "/families".
 */
export function isLinkActive(link: NavLink, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const href = link.href.replace(/\/+$/, '') || '/';
  if (link.match === 'exact') return path === href;
  return path === href || path.startsWith(href + '/');
}
