/**
 * Pure helpers for U0-C browse/list-page usability.
 *
 * Shared by /dishes, /families, /regions, /lineages. Pure functions so
 * tests run in plain Node without a DOM or React.
 *
 * Domain helpers come from `./domain` so the Atlas/Recipes rules stay
 * in one place.
 */

import { ATLAS_ORIGIN, type GustaleDomain, RECIPES_ORIGIN } from "./domain";

// ─── Shared link type ───────────────────────────────────────────────────

export interface BrowseLink {
  href: string;
  label: string;
}

// ─── Query state shape ──────────────────────────────────────────────────

/** Free-text query. Structured tokens remain supported but not advertised. */
export interface BrowseQueryState {
  q: string;
  family: string | null;
  country: string | null;
  cuisine: string | null;
  type: string | null;
  ingredient: string | null;
  technique: string | null;
  sort: string | null;
  /** 1-based page index for shareable URL state. */
  page: number;
}

export const DEFAULT_BROWSE_STATE: BrowseQueryState = {
  q: "",
  family: null,
  country: null,
  cuisine: null,
  type: null,
  ingredient: null,
  technique: null,
  sort: null,
  page: 1,
};

export const BROWSE_PAGE_SIZE = 24;

export const BROWSE_URL_KEYS = [
  "q",
  "family",
  "country",
  "cuisine",
  "type",
  "ingredient",
  "technique",
  "sort",
  "page",
] as const;

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

  const pageRaw = parseInt(get("page") ?? "1", 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1
      ? Math.min(1000, Math.floor(pageRaw))
      : 1;

  return {
    q: (get("q") ?? "").trim(),
    family: emptyToNull(get("family")),
    country: emptyToNull(get("country")),
    cuisine: emptyToNull(get("cuisine")),
    type: emptyToNull(get("type")),
    ingredient: emptyToNull(get("ingredient")),
    technique: emptyToNull(get("technique")),
    sort: emptyToNull(get("sort")),
    page,
  };
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function serializeBrowseState(state: BrowseQueryState): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.family) sp.set("family", state.family);
  if (state.country) sp.set("country", state.country);
  if (state.cuisine) sp.set("cuisine", state.cuisine);
  if (state.type) sp.set("type", state.type);
  if (state.ingredient) sp.set("ingredient", state.ingredient);
  if (state.technique) sp.set("technique", state.technique);
  if (state.sort) sp.set("sort", state.sort);
  if (state.page && state.page > 1) sp.set("page", String(state.page));
  return sp;
}

export function buildBrowseQuery(state: BrowseQueryState): string {
  const s = serializeBrowseState(state).toString();
  return s ? `?${s}` : "";
}

/**
 * Legacy structured-syntax parser for deep-links (`country:Italy`).
 * UI is plain free-text; this keeps old URLs working.
 */
export function parseStructuredTokens(
  input: string,
): Partial<BrowseQueryState> {
  const tokens = input.match(/(\S+):(\S+)/g) ?? [];
  if (tokens.length === 0) return {};
  const result: Partial<BrowseQueryState> = {};
  let free = input;
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon < 0) continue;
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    free = free.replace(tok, "");
    if (key === "origin" || key === "country" || key === "region") {
      result.country = val;
    } else if (key === "cuisine" || key === "category") {
      result.cuisine = val;
    } else if (key === "type" || key === "dish-type") {
      result.type = val;
    } else if (key === "ingredient") {
      result.ingredient = val;
    } else if (key === "technique") {
      result.technique = val;
    } else if (key === "family") {
      result.family = val;
    }
  }
  const q = free.replace(/\s+/g, " ").trim();
  if (q) result.q = q;
  return result;
}

export function mergeBrowseState(
  base: BrowseQueryState,
  patch: Partial<BrowseQueryState>,
): BrowseQueryState {
  return { ...base, ...patch };
}

// ─── Filtering (in-memory) ──────────────────────────────────────────────

export interface LikeableDish {
  slug?: string | null;
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

export function matchesBrowseQuery(
  dish: LikeableDish,
  state: BrowseQueryState,
): boolean {
  if (
    state.family &&
    (dish.familySlug ?? "").toLowerCase() !== state.family.toLowerCase()
  ) {
    return false;
  }
  if (
    state.country &&
    (dish.originName ?? "").toLowerCase() !== state.country.toLowerCase()
  ) {
    return false;
  }
  if (
    state.cuisine &&
    (dish.cuisineName ?? "").toLowerCase() !== state.cuisine.toLowerCase()
  ) {
    return false;
  }
  if (
    state.type &&
    (dish.typeSlug ?? "").toLowerCase() !== state.type.toLowerCase()
  ) {
    return false;
  }
  if (
    state.technique &&
    (dish.techniqueSlug ?? "").toLowerCase() !== state.technique.toLowerCase()
  ) {
    return false;
  }
  if (state.ingredient) {
    const slug = state.ingredient.toLowerCase();
    const matches = (dish.ingredients ?? []).some(
      (i) => (i.slug ?? "").toLowerCase() === slug,
    );
    if (!matches) return false;
  }
  if (state.q) {
    const needle = state.q.toLowerCase();
    const haystack = [
      dish.canonicalName ?? "",
      dish.shortDescription ?? "",
      dish.familyName ?? "",
      dish.originName ?? "",
      dish.cuisineName ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export function applyBrowseFilter<T extends LikeableDish>(
  dishes: readonly T[],
  state: BrowseQueryState,
): T[] {
  if (
    !state.q &&
    !state.family &&
    !state.country &&
    !state.cuisine &&
    !state.type &&
    !state.ingredient &&
    !state.technique
  ) {
    return dishes.slice();
  }
  return dishes.filter((d) => matchesBrowseQuery(d, state));
}

// ─── Pagination helpers ─────────────────────────────────────────────────

export function pageOffset(page: number, pageSize: number): number {
  if (!Number.isFinite(page) || page < 1) return 0;
  return (Math.floor(page) - 1) * pageSize;
}

export function appendDishes<T extends { id: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] {
  const seen = new Set(existing.map((d) => d.id));
  const merged: T[] = existing.slice();
  for (const d of additions) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
  }
  return merged;
}

/** True when the last API page was full — there may be another page. */
export function hasMorePages(lastPageSize: number, pageSize: number): boolean {
  return lastPageSize >= pageSize && pageSize > 0;
}

/**
 * Keep only the first `page` pages of accumulated dishes (for Back history).
 * Page is 1-based. Does not fetch — pure trim of already-loaded cards.
 */
export function sliceDishesToPage<T>(
  dishes: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  if (!Number.isFinite(page) || page < 1 || pageSize <= 0) return [];
  return dishes.slice(0, Math.floor(page) * pageSize);
}

/**
 * How many full/partial pages `dishCount` currently represents, given pageSize.
 * Empty list → 0 loaded pages (caller treats as needing page 1 fetch).
 */
export function loadedPageFromCount(
  dishCount: number,
  pageSize: number,
): number {
  if (!Number.isFinite(dishCount) || dishCount <= 0 || pageSize <= 0) return 0;
  return Math.ceil(dishCount / pageSize);
}

export type HistoryRestorePlan =
  | { action: "noop" }
  | { action: "trim"; page: number }
  | { action: "extend"; fromPage: number; toPage: number };

/**
 * Decide how to reconcile URL `targetPage` with already-loaded pages.
 * Load more must update `loadedPage` before bumping URL page so this returns noop.
 */
export function planHistoryRestore(
  targetPage: number,
  loadedPage: number,
): HistoryRestorePlan {
  const target =
    Number.isFinite(targetPage) && targetPage >= 1 ? Math.floor(targetPage) : 1;
  const loaded =
    Number.isFinite(loadedPage) && loadedPage >= 0 ? Math.floor(loadedPage) : 0;
  if (target === loaded) return { action: "noop" };
  if (target < loaded) return { action: "trim", page: target };
  return { action: "extend", fromPage: loaded, toPage: target };
}

/** Filter fingerprint excluding page — used to detect filter resets. */
export function browseFiltersKey(state: BrowseQueryState): string {
  return [
    state.q,
    state.family ?? "",
    state.country ?? "",
    state.cuisine ?? "",
    state.type ?? "",
    state.ingredient ?? "",
    state.technique ?? "",
    state.sort ?? "",
  ].join("\0");
}

/**
 * Exact case-insensitive country match (production list semantics for U0-C).
 * Substring matches like "United" → "United States" are intentionally rejected.
 */
export function countryMatchesExact(
  originName: string | null | undefined,
  country: string | null | undefined,
): boolean {
  if (country == null || country.trim() === "") return true;
  return (originName ?? "").toLowerCase() === country.trim().toLowerCase();
}

// ─── Filter chips ───────────────────────────────────────────────────────

export interface FilterChip {
  key: string;
  label: string;
  stateKey: keyof BrowseQueryState;
  value: string;
}

const FRIENDLY_LABELS: Record<keyof BrowseQueryState, string> = {
  q: "Search",
  family: "Family",
  country: "Country",
  cuisine: "Cuisine",
  type: "Type",
  ingredient: "Ingredient",
  technique: "Technique",
  sort: "Sort",
  page: "Page",
};

export function filterChipsFor(state: BrowseQueryState): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of BROWSE_URL_KEYS) {
    if (key === "page" || key === "sort") continue;
    const v = state[key];
    if (typeof v === "string" && v.trim() !== "") {
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

export function removeBrowseChip(
  state: BrowseQueryState,
  stateKey: keyof BrowseQueryState,
): BrowseQueryState {
  if (stateKey === "page") return { ...state, page: 1 };
  if (stateKey === "sort") return { ...state, sort: null, page: 1 };
  if (stateKey === "q") return { ...state, q: "", page: 1 };
  return { ...state, [stateKey]: null, page: 1 };
}

export function clearBrowseFilters(): BrowseQueryState {
  return { ...DEFAULT_BROWSE_STATE };
}

export function browseHasActiveFilters(state: BrowseQueryState): boolean {
  return filterChipsFor(state).length > 0;
}

// ─── Family directory ───────────────────────────────────────────────────

export interface FamilyEntry {
  slug: string;
  name: string;
  count: number;
  dishNames: string[];
  sampleOrigins: string[];
}

const FAMILY_LABELS: Record<string, string> = {
  "noodle-soup": "Noodle soups",
  soup: "Soups",
  stew: "Stews & braises",
  curry: "Curries",
  pasta: "Pasta",
  bread: "Breads",
  dumpling: "Dumplings",
  "rice-dish": "Rice dishes",
  "fried-rice": "Fried rice",
  kebab: "Grilled & skewered",
  salad: "Salads",
  pancake: "Flatbreads & griddled",
  casserole: "Casseroles & baked",
  sandwich: "Sandwiches",
  appetizer: "Appetizers",
  "main-course": "Main courses",
  side: "Side dishes",
  dessert: "Desserts",
  sauce: "Sauces & condiments",
  moussaka: "Moussaka",
  "stir-fry": "Stir-fries",
  "street-snack": "Street snacks",
  fermented: "Fermented",
  "egg-dishes": "Egg dishes",
  other: "Other",
};

export function familyLabel(slug: string): string {
  return (
    FAMILY_LABELS[slug] ??
    slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ")
  );
}

export function buildFamilyDirectory(
  dishes: readonly LikeableDish[],
): FamilyEntry[] {
  const groups = new Map<string, LikeableDish[]>();
  for (const d of dishes) {
    const key = d.familySlug ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return [...groups.entries()]
    .map(([slug, list]) => {
      const origins = [
        ...new Set(
          list.map((d) => d.originName).filter((x): x is string => Boolean(x)),
        ),
      ];
      return {
        slug,
        name: list[0]?.familyName || familyLabel(slug),
        count: list.length,
        dishNames: list
          .map((d) => d.canonicalName)
          .filter((x): x is string => Boolean(x))
          .slice(0, 8),
        sampleOrigins: origins.slice(0, 4),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterFamilyDirectory(
  entries: readonly FamilyEntry[],
  q: string,
): FamilyEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries.slice();
  return entries.filter((e) => {
    if (e.name.toLowerCase().includes(needle)) return true;
    if (e.slug.toLowerCase().includes(needle)) return true;
    return e.dishNames.some((n) => n.toLowerCase().includes(needle));
  });
}

// ─── Country directory (/regions) ───────────────────────────────────────

export interface CountryEntry {
  name: string;
  count: number;
  dishNames: string[];
  letter: string;
}

export function buildCountryDirectory(
  dishes: readonly LikeableDish[],
): CountryEntry[] {
  const groups = new Map<string, LikeableDish[]>();
  for (const d of dishes) {
    const key = d.originName?.trim() || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      count: list.length,
      dishNames: list
        .map((d) => d.canonicalName)
        .filter((x): x is string => Boolean(x))
        .slice(0, 8),
      letter: name.charAt(0).toUpperCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCountryDirectory(
  entries: readonly CountryEntry[],
  q: string,
): CountryEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries.slice();
  return entries.filter((e) => {
    if (e.name.toLowerCase().includes(needle)) return true;
    return e.dishNames.some((n) => n.toLowerCase().includes(needle));
  });
}

export function countryAlphaIndex(entries: readonly CountryEntry[]): string[] {
  const letters = new Set(entries.map((e) => e.letter));
  return [...letters].sort();
}

// ─── Lineage filter state ───────────────────────────────────────────────

export interface LineageFilterState {
  q: string;
  region: string | null;
  technique: string | null;
  force: string | null;
  confidence: string | null;
}

export const DEFAULT_LINEAGE_FILTERS: LineageFilterState = {
  q: "",
  region: null,
  technique: null,
  force: null,
  confidence: null,
};

export function parseLineageFilters(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
): LineageFilterState {
  const get = (key: string): string | null => {
    if (source instanceof URLSearchParams) return source.get(key);
    const v = source[key];
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  };
  return {
    q: (get("q") ?? get("search") ?? "").trim(),
    region: emptyToNull(get("region") ?? get("origin")),
    technique: emptyToNull(get("technique")),
    force: emptyToNull(get("force") ?? get("historicalForce")),
    confidence: emptyToNull(get("confidence")),
  };
}

export function serializeLineageFilters(
  state: LineageFilterState,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.region) sp.set("region", state.region);
  if (state.technique) sp.set("technique", state.technique);
  if (state.force) sp.set("force", state.force);
  if (state.confidence) sp.set("confidence", state.confidence);
  return sp;
}

export function buildLineageQuery(state: LineageFilterState): string {
  const s = serializeLineageFilters(state).toString();
  return s ? `?${s}` : "";
}

export function lineageFilterChips(state: LineageFilterState): Array<{
  key: string;
  label: string;
  stateKey: keyof LineageFilterState;
  value: string;
}> {
  const chips: Array<{
    key: string;
    label: string;
    stateKey: keyof LineageFilterState;
    value: string;
  }> = [];
  if (state.q) {
    chips.push({
      key: `q:${state.q}`,
      label: `Search: ${state.q}`,
      stateKey: "q",
      value: state.q,
    });
  }
  if (state.region) {
    chips.push({
      key: `region:${state.region}`,
      label: `Region: ${state.region}`,
      stateKey: "region",
      value: state.region,
    });
  }
  if (state.technique) {
    chips.push({
      key: `technique:${state.technique}`,
      label: `Technique: ${state.technique}`,
      stateKey: "technique",
      value: state.technique,
    });
  }
  if (state.force) {
    chips.push({
      key: `force:${state.force}`,
      label: `Force: ${state.force}`,
      stateKey: "force",
      value: state.force,
    });
  }
  if (state.confidence) {
    chips.push({
      key: `confidence:${state.confidence}`,
      label: `Confidence: ${state.confidence}`,
      stateKey: "confidence",
      value: state.confidence,
    });
  }
  return chips;
}

export function removeLineageChip(
  state: LineageFilterState,
  stateKey: keyof LineageFilterState,
): LineageFilterState {
  if (stateKey === "q") return { ...state, q: "" };
  return { ...state, [stateKey]: null };
}

export function clearLineageFilters(): LineageFilterState {
  return { ...DEFAULT_LINEAGE_FILTERS };
}

export interface LikeableLineage {
  name: string;
  slug: string;
  shortDescription?: string | null;
  conceptSummary?: string | null;
  techniques?: string[];
  originRegions?: string[];
  relatedRegions?: string[];
  historicalForces?: string[];
  confidenceLevel?: string;
  representativeDishes?: string[];
}

export function matchesLineageFilters(
  lin: LikeableLineage,
  state: LineageFilterState,
): boolean {
  const kebab = (s: string) => s.toLowerCase().replace(/_/g, "-");
  if (state.region) {
    const regions = [
      ...(lin.originRegions ?? []),
      ...(lin.relatedRegions ?? []),
    ].map(kebab);
    if (!regions.includes(kebab(state.region))) return false;
  }
  if (state.technique) {
    const techs = (lin.techniques ?? []).map(kebab);
    if (!techs.includes(kebab(state.technique))) return false;
  }
  if (state.force) {
    const forces = (lin.historicalForces ?? []).map(kebab);
    if (!forces.includes(kebab(state.force))) return false;
  }
  if (state.confidence && (lin.confidenceLevel ?? "") !== state.confidence) {
    return false;
  }
  if (state.q) {
    const needle = state.q.toLowerCase();
    const hay = [
      lin.name,
      lin.shortDescription ?? "",
      lin.conceptSummary ?? "",
      ...(lin.techniques ?? []),
      ...(lin.originRegions ?? []),
      ...(lin.relatedRegions ?? []),
      ...(lin.representativeDishes ?? []),
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function applyLineageFilter<T extends LikeableLineage>(
  lineages: readonly T[],
  state: LineageFilterState,
): T[] {
  return lineages.filter((l) => matchesLineageFilters(l, state));
}

// ─── Recovery links (domain-valid) ───────────────────────────────────────

export interface RecoveryLinks {
  primary: BrowseLink[];
  altBrowse: BrowseLink | null;
}

export function recoveryLinks(domain: GustaleDomain): RecoveryLinks {
  if (domain === "geo") {
    return {
      primary: [
        { href: "/", label: "Globe" },
        { href: "/regions", label: "Countries" },
        { href: "/families", label: "Food families" },
        { href: "/lineages", label: "Lineages" },
      ],
      altBrowse: { href: `${RECIPES_ORIGIN}/dishes`, label: "Browse recipes" },
    };
  }
  return {
    primary: [
      { href: "/dishes", label: "Recipes" },
      { href: "/ingredients", label: "Ingredients" },
      { href: "/families", label: "Food families" },
      { href: "/lineages", label: "Lineages" },
    ],
    altBrowse: { href: `${ATLAS_ORIGIN}/`, label: "Gustale Atlas" },
  };
}

/** Map CTA — local on Atlas, absolute on Recipes (map stripped post-build). */
export function mapBrowseHref(domain: GustaleDomain): string {
  if (domain === "geo") return "/map";
  return `${ATLAS_ORIGIN}/map`;
}

export function safeQueryEncode(value: string, maxLen = 200): string {
  const trimmed = (value ?? "").trim().slice(0, maxLen);
  return encodeURIComponent(trimmed);
}

export function absoluteDishesIndexHref(
  domain: GustaleDomain,
  query = "",
): string {
  const q = query.trim();
  const suffix = q ? `?q=${safeQueryEncode(q)}` : "";
  if (domain === "geo") return `${RECIPES_ORIGIN}/dishes${suffix}`;
  return `/dishes${suffix}`;
}

export function dishDetailHref(slug: string): string {
  return `/dishes/${encodeURIComponent(slug)}`;
}

export function familyDetailHref(slug: string): string {
  return `/family/${encodeURIComponent(slug)}/`;
}

export function browseStatusMessage(opts: {
  loading: boolean;
  failed: boolean;
  count: number;
  query: string;
  noun: string;
}): string {
  if (opts.loading) return "Updating results…";
  if (opts.failed) return "Browse data is temporarily unavailable.";
  if (opts.count === 0) {
    return opts.query
      ? `No ${opts.noun} match “${opts.query}”.`
      : `No ${opts.noun} to show.`;
  }
  return `${opts.count} ${opts.noun}`;
}
