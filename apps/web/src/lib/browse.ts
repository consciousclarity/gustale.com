/**
 * Pure helpers for U0-C browse/list-page usability.
 *
 * Shared by /dishes, /families, /regions, /lineages. Pure functions so
 * tests run in plain Node without a DOM or React.
 *
 * Domain helpers come from `./domain` so the Atlas/Recipes rules stay
 * in one place; this module does not duplicate the property-switch
 * logic — it only resolves the local-vs-absolute question for browse
 * CTAs (See all, family detail, region entry, etc.).
 */

import {
  ATLAS_ORIGIN,
  RECIPES_ORIGIN,
  type GustaleDomain,
} from './domain';

// ─── Query state shape ──────────────────────────────────────────────────

/** Free-text query. No structured-syntax required. */
export interface BrowseQueryState {
  /** Free-text query, trimmed, lowercase for matching. */
  q: string;
  /** Optional family slug (single value — UI surfaces it as a chip). */
  family: string | null;
  /** Optional origin country / region name. */
  country: string | null;
  /** Optional cuisine name. */
  cuisine: string | null;
  /** Optional dish-type category (e.g. "stew"). */
  type: string | null;
  /** Optional ingredient slug. */
  ingredient: string | null;
  /** Optional technique. */
  technique: string | null;
  /** Sort key, if any. Default sort is server-provided. */
  sort: string | null;
  /** Numeric page index (1-based). Persists in the URL. */
  page: number;
}

export const DEFAULT_BROWSE_STATE: BrowseQueryState = {
  q: '',
  family: null,
  country: null,
  cuisine: null,
  type: null,
  ingredient: null,
  technique: null,
  sort: null,
  page: 1,
};

// ─── URL ↔ state ────────────────────────────────────────────────────────

/** Field names that survive a URL round-trip. */
export const BROWSE_URL_KEYS = [
  'q',
  'family',
  'country',
  'cuisine',
  'type',
  'ingredient',
  'technique',
  'sort',
  'page',
] as const;

/**
 * Pull a BrowseQueryState out of a URLSearchParams-like object.
 * Pass `window.location.search` (already `URLSearchParams`-compatible)
 * or a plain object. Unknown / extra keys are ignored.
 */
export function parseBrowseState(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
): BrowseQueryState {
  const get = (key: string): string | null => {
    if (source instanceof URLSearchParams) return source.get(key);
    const v = source[key];
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  };

  const pageRaw = parseInt(get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(1000, Math.floor(pageRaw)) : 1;

  const q = (get('q') ?? '').trim();
  return {
    q,
    family: emptyToNull(get('family')),
    country: emptyToNull(get('country')),
    cuisine: emptyToNull(get('cuisine')),
    type: emptyToNull(get('type')),
    ingredient: emptyToNull(get('ingredient')),
    technique: emptyToNull(get('technique')),
    sort: emptyToNull(get('sort')),
    page,
  };
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Serialise state to URLSearchParams. Preserves the order of BROWSE_URL_KEYS
 * for stable string output. Empty / null fields are dropped so the URL
 * stays clean.
 */
export function serializeBrowseState(state: BrowseQueryState): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.family) sp.set('family', state.family);
  if (state.country) sp.set('country', state.country);
  if (state.cuisine) sp.set('cuisine', state.cuisine);
  if (state.type) sp.set('type', state.type);
  if (state.ingredient) sp.set('ingredient', state.ingredient);
  if (state.technique) sp.set('technique', state.technique);
  if (state.sort) sp.set('sort', state.sort);
  if (state.page && state.page > 1) sp.set('page', String(state.page));
  return sp;
}

/** Build the canonical query string for `history.pushState`. Empty ⇒ '?'. */
export function buildBrowseQuery(state: BrowseQueryState): string {
  const sp = serializeBrowseState(state);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ─── User-friendly search input ──────────────────────────────────────────

/**
 * Legacy structured-syntax parser kept for back-compat with existing
 * deep-links (`?country=Italy`). New U0-C UI is plain free-text; the
 * parser still recognises `key:value` tokens so old links keep working,
 * but the user-facing surface no longer advertises the syntax.
 *
 * Returns a partial BrowseQueryState update; merges via `mergeBrowseState`.
 */
export function parseStructuredTokens(input: string): Partial<BrowseQueryState> {
  const tokens = input.match(/(\S+):(\S+)/g) ?? [];
  if (tokens.length === 0) return {};
  const result: Partial<BrowseQueryState> = {};
  let free = input;
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    if (colon < 0) continue;
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1).toLowerCase();
    free = free.replace(tok, '');
    if (key === 'origin' || key === 'country' || key === 'region') {
      result.country = val;
    } else if (key === 'cuisine' || key === 'category') {
      result.cuisine = val;
    } else if (key === 'type' || key === 'dish-type') {
      result.type = val;
    } else if (key === 'ingredient') {
      result.ingredient = val;
    } else if (key === 'technique') {
      result.technique = val;
    } else if (key === 'family') {
      result.family = val;
    }
  }
  const q = (free ?? '').replace(/\s+/g, ' ').trim();
  if (q) result.q = q;
  return result;
}

/** Merge a partial update onto a base state. */
export function mergeBrowseState(
  base: BrowseQueryState,
  patch: Partial<BrowseQueryState>,
): BrowseQueryState {
  return { ...base, ...patch };
}

// ─── Filtering (in-memory) ──────────────────────────────────────────────

export interface LikeableDish {
  canonicalName?: string | null;
  shortDescription?: string | null;
  familySlug?: string | null;
  familyName?: string | null;
  originName?: string | null;
  cuisineName?: string | null;
  typeSlug?: string | null;
  techniqueSlug?: string | null;
  ingredients?: Array<{ slug?: string | null }> | null;
}

/** True if the dish matches the free-text + structured query. */
export function matchesBrowseQuery(dish: LikeableDish, state: BrowseQueryState): boolean {
  if (state.family && (dish.familySlug ?? '').toLowerCase() !== state.family) return false;
  if (state.country && (dish.originName ?? '').toLowerCase() !== state.country) return false;
  if (state.cuisine && (dish.cuisineName ?? '').toLowerCase() !== state.cuisine) return false;
  if (state.type && (dish.typeSlug ?? '').toLowerCase() !== state.type) return false;
  if (state.technique && (dish.techniqueSlug ?? '').toLowerCase() !== state.technique) return false;
  if (state.ingredient) {
    const slug = state.ingredient;
    const matches = (dish.ingredients ?? []).some((i) => (i.slug ?? '').toLowerCase() === slug);
    if (!matches) return false;
  }
  if (state.q) {
    const needle = state.q.toLowerCase();
    const haystack = [
      dish.canonicalName ?? '',
      dish.shortDescription ?? '',
      dish.familyName ?? '',
      dish.originName ?? '',
      dish.cuisineName ?? '',
    ].join(' ').toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Apply browse-state filtering to a dish list. Stable input order. */
export function applyBrowseFilter<T extends LikeableDish>(
  dishes: readonly T[],
  state: BrowseQueryState,
): T[] {
  if (!state.q && !state.family && !state.country && !state.cuisine &&
      !state.type && !state.ingredient && !state.technique) {
    return dishes.slice();
  }
  return dishes.filter((d) => matchesBrowseQuery(d, state));
}

// ─── Pagination helpers ─────────────────────────────────────────────────

/** Compute the API offset for a (page, pageSize) pair. page is 1-based. */
export function pageOffset(page: number, pageSize: number): number {
  if (!Number.isFinite(page) || page < 1) return 0;
  return (page - 1) * pageSize;
}

/**
 * Append a freshly fetched page to the existing list, deduplicating by
 * `id` so SSR + client-fetched pages don't show duplicate cards.
 */
export function appendDishes<T extends { id: string }>(existing: readonly T[], additions: readonly T[]): T[] {
  const seen = new Set(existing.map((d) => d.id));
  const merged: T[] = existing.slice();
  for (const d of additions) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
  }
  return merged;
}

/**
 * Compute whether another page exists given the running list size and
 * the most-recent API page size. The API doesn't return a `total` count,
 * so we infer "more pages" from whether the last page came back full
 * (or from an explicit `hasMore` flag on the response).
 */
export function hasMorePages(
  totalLoaded: number,
  lastPageSize: number,
  pageSize: number,
): boolean {
  if (lastPageSize < pageSize) return false;
  return totalLoaded % pageSize === 0 && totalLoaded > 0;
}

// ─── Filter chips ───────────────────────────────────────────────────────

export interface FilterChip {
  /** Stable key, used as React list key. */
  key: string;
  /** User-facing label. */
  label: string;
  /** State key to clear when removed. */
  stateKey: keyof BrowseQueryState;
  /** Current value to clear. */
  value: string;
}

const FRIENDLY_LABELS: Record<keyof BrowseQueryState, string> = {
  q: 'Search',
  family: 'Family',
  country: 'Country',
  cuisine: 'Cuisine',
  type: 'Type',
  ingredient: 'Ingredient',
  technique: 'Technique',
  sort: 'Sort',
  page: 'Page',
};

/** Build removable-chip descriptors for non-empty state fields. */
export function filterChipsFor(state: BrowseQueryState): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of BROWSE_URL_KEYS) {
    if (key === 'page' || key === 'sort') continue;
    const v = state[key];
    if (typeof v === 'string' && v.trim() !== '') {
      chips.push({
        key: `${key}:${v}`,
        label: `${FRIENDLY_LABELS[key] ?? key}: ${v}`,
        stateKey: key,
        value: v,
      });
    }
  }
  return chips;
}

/** Remove a single chip from state — returns a new state object. */
export function removeBrowseChip(
  state: BrowseQueryState,
  stateKey: keyof BrowseQueryState,
): BrowseQueryState {
  if (stateKey === 'page') return { ...state, page: 1 };
  if (stateKey === 'sort') return { ...state, sort: null };
  return { ...state, [stateKey]: keyDefault(stateKey), page: 1 };
}

function keyDefault(key: keyof BrowseQueryState): string | null {
  if (key === 'q') return '';
  return null;
}

/** Clear every filter at once — keeps only the page index (reset to 1). */
export function clearBrowseFilters(state: BrowseQueryState): BrowseQueryState {
  return {
    q: '',
    family: null,
    country: null,
    cuisine: null,
    type: null,
    ingredient: null,
    technique: null,
    sort: null,
    page: 1,
  };
}

// ─── Recovery links (domain-valid) ───────────────────────────────────────

export interface RecoveryLinks {
  primary: BrowseLink[];
  altBrowse: { href: string; label: string } | null;
}

/**
 * Domain-valid recovery links for empty / failed browse pages.
 *
 * Atlas: Globe, Countries, Food families, Lineages and absolute Browse recipes.
 * Recipes: Recipes, Ingredients, Food families, Lineages and absolute Atlas.
 */
export function recoveryLinks(domain: GustaleDomain): RecoveryLinks {
  if (domain === 'geo') {
    return {
      primary: [
        { href: '/', label: 'Globe' },
        { href: '/regions', label: 'Countries' },
        { href: '/families', label: 'Food families' },
        { href: '/lineages', label: 'Lineages' },
      ],
      altBrowse: { href: `${RECIPES_ORIGIN}/dishes`, label: 'Browse recipes' },
    };
  }
  return {
    primary: [
      { href: '/dishes', label: 'Recipes' },
      { href: '/ingredients', label: 'Ingredients' },
      { href: '/families', label: 'Food families' },
      { href: '/lineages', label: 'Lineages' },
    ],
    altBrowse: { href: `${ATLAS_ORIGIN}/`, label: 'Gustale Atlas' },
  };
}

// ─── Safe query encoding ────────────────────────────────────────────────

/** URL-encode a free-text query, clamping to a reasonable length. */
export function safeQueryEncode(value: string, maxLen = 200): string {
  const trimmed = (value ?? '').trim().slice(0, maxLen);
  return encodeURIComponent(trimmed);
}

// ─── See-all-style absolute link ────────────────────────────────────────

/**
 * Local /dishes index is Recipes-only (post-build removes it on geo).
 * When Geo browse surfaces need to deep-link to the recipes list, they
 * MUST use this helper so the link is absolute on Atlas.
 */
export function absoluteDishesIndexHref(domain: GustaleDomain, query = ''): string {
  const q = query.trim();
  const suffix = q ? `?q=${safeQueryEncode(q)}` : '';
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes${suffix}`;
  return `/dishes${suffix}`;
}