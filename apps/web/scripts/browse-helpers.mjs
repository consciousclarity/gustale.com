/**
 * ESM twin of src/lib/browse.ts for Node tests.
 * Keep in sync with the TypeScript source.
 */

export const ATLAS_ORIGIN = 'https://gustale.com';
export const RECIPES_ORIGIN = 'https://gustale.recipes';
export const BROWSE_PAGE_SIZE = 24;

export const DEFAULT_BROWSE_STATE = {
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

export const BROWSE_URL_KEYS = [
  'q', 'family', 'country', 'cuisine', 'type', 'ingredient', 'technique', 'sort', 'page',
];

function emptyToNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

export function parseBrowseState(source) {
  const get = (key) => {
    if (source instanceof URLSearchParams) return source.get(key);
    const v = source[key];
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  };
  const pageRaw = parseInt(get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(1000, Math.floor(pageRaw)) : 1;
  return {
    q: (get('q') ?? '').trim(),
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

export function serializeBrowseState(state) {
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

export function buildBrowseQuery(state) {
  const s = serializeBrowseState(state).toString();
  return s ? `?${s}` : '';
}

export function parseStructuredTokens(input) {
  const tokens = input.match(/(\S+):(\S+)/g) ?? [];
  if (tokens.length === 0) return {};
  const result = {};
  let free = input;
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    if (colon < 0) continue;
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    free = free.replace(tok, '');
    if (key === 'origin' || key === 'country' || key === 'region') result.country = val;
    else if (key === 'cuisine' || key === 'category') result.cuisine = val;
    else if (key === 'type' || key === 'dish-type') result.type = val;
    else if (key === 'ingredient') result.ingredient = val;
    else if (key === 'technique') result.technique = val;
    else if (key === 'family') result.family = val;
  }
  const q = free.replace(/\s+/g, ' ').trim();
  if (q) result.q = q;
  return result;
}

export function matchesBrowseQuery(dish, state) {
  if (state.family && (dish.familySlug ?? '').toLowerCase() !== state.family.toLowerCase()) return false;
  if (state.country && (dish.originName ?? '').toLowerCase() !== state.country.toLowerCase()) return false;
  if (state.cuisine && (dish.cuisineName ?? '').toLowerCase() !== state.cuisine.toLowerCase()) return false;
  if (state.type && (dish.typeSlug ?? '').toLowerCase() !== state.type.toLowerCase()) return false;
  if (state.technique && (dish.techniqueSlug ?? '').toLowerCase() !== state.technique.toLowerCase()) return false;
  if (state.ingredient) {
    const slug = state.ingredient.toLowerCase();
    if (!(dish.ingredients ?? []).some((i) => (i.slug ?? '').toLowerCase() === slug)) return false;
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

export function applyBrowseFilter(dishes, state) {
  if (!state.q && !state.family && !state.country && !state.cuisine && !state.type && !state.ingredient && !state.technique) {
    return dishes.slice();
  }
  return dishes.filter((d) => matchesBrowseQuery(d, state));
}

export function pageOffset(page, pageSize) {
  if (!Number.isFinite(page) || page < 1) return 0;
  return (Math.floor(page) - 1) * pageSize;
}

export function appendDishes(existing, additions) {
  const seen = new Set(existing.map((d) => d.id));
  const merged = existing.slice();
  for (const d of additions) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
  }
  return merged;
}

export function hasMorePages(lastPageSize, pageSize) {
  return lastPageSize >= pageSize && pageSize > 0;
}

export function sliceDishesToPage(dishes, page, pageSize) {
  if (!Number.isFinite(page) || page < 1 || pageSize <= 0) return [];
  return dishes.slice(0, Math.floor(page) * pageSize);
}

export function loadedPageFromCount(dishCount, pageSize) {
  if (!Number.isFinite(dishCount) || dishCount <= 0 || pageSize <= 0) return 0;
  return Math.ceil(dishCount / pageSize);
}

export function planHistoryRestore(targetPage, loadedPage) {
  const target = Number.isFinite(targetPage) && targetPage >= 1 ? Math.floor(targetPage) : 1;
  const loaded = Number.isFinite(loadedPage) && loadedPage >= 0 ? Math.floor(loadedPage) : 0;
  if (target === loaded) return { action: 'noop' };
  if (target < loaded) return { action: 'trim', page: target };
  return { action: 'extend', fromPage: loaded, toPage: target };
}

export function browseFiltersKey(state) {
  return [
    state.q,
    state.family ?? '',
    state.country ?? '',
    state.cuisine ?? '',
    state.type ?? '',
    state.ingredient ?? '',
    state.technique ?? '',
    state.sort ?? '',
  ].join('\0');
}

export function countryMatchesExact(originName, country) {
  if (country == null || String(country).trim() === '') return true;
  return (originName ?? '').toLowerCase() === String(country).trim().toLowerCase();
}

export function filterChipsFor(state) {
  const labels = {
    q: 'Search', family: 'Family', country: 'Country', cuisine: 'Cuisine',
    type: 'Type', ingredient: 'Ingredient', technique: 'Technique',
  };
  const chips = [];
  for (const key of BROWSE_URL_KEYS) {
    if (key === 'page' || key === 'sort') continue;
    const v = state[key];
    if (typeof v === 'string' && v.trim() !== '') {
      chips.push({ key: `${key}:${v}`, label: `${labels[key] ?? key}: ${v}`, stateKey: key, value: v });
    }
  }
  return chips;
}

export function removeBrowseChip(state, stateKey) {
  if (stateKey === 'page') return { ...state, page: 1 };
  if (stateKey === 'sort') return { ...state, sort: null, page: 1 };
  if (stateKey === 'q') return { ...state, q: '', page: 1 };
  return { ...state, [stateKey]: null, page: 1 };
}

export function clearBrowseFilters() {
  return { ...DEFAULT_BROWSE_STATE };
}

export function buildFamilyDirectory(dishes) {
  const groups = new Map();
  for (const d of dishes) {
    const key = d.familySlug ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()].map(([slug, list]) => ({
    slug,
    name: list[0]?.familyName || slug,
    count: list.length,
    dishNames: list.map((d) => d.canonicalName).filter(Boolean).slice(0, 8),
    sampleOrigins: [...new Set(list.map((d) => d.originName).filter(Boolean))].slice(0, 4),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterFamilyDirectory(entries, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries.slice();
  return entries.filter((e) =>
    e.name.toLowerCase().includes(needle)
    || e.slug.toLowerCase().includes(needle)
    || e.dishNames.some((n) => n.toLowerCase().includes(needle)));
}

export function buildCountryDirectory(dishes) {
  const groups = new Map();
  for (const d of dishes) {
    const key = d.originName?.trim() || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()].map(([name, list]) => ({
    name,
    count: list.length,
    dishNames: list.map((d) => d.canonicalName).filter(Boolean).slice(0, 8),
    letter: name.charAt(0).toUpperCase(),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCountryDirectory(entries, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries.slice();
  return entries.filter((e) =>
    e.name.toLowerCase().includes(needle)
    || e.dishNames.some((n) => n.toLowerCase().includes(needle)));
}

export function countryAlphaIndex(entries) {
  return [...new Set(entries.map((e) => e.letter))].sort();
}

export function parseLineageFilters(source) {
  const get = (key) => {
    if (source instanceof URLSearchParams) return source.get(key);
    const v = source[key];
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  };
  return {
    q: (get('q') ?? get('search') ?? '').trim(),
    region: emptyToNull(get('region') ?? get('origin')),
    technique: emptyToNull(get('technique')),
    force: emptyToNull(get('force') ?? get('historicalForce')),
    confidence: emptyToNull(get('confidence')),
  };
}

export function serializeLineageFilters(state) {
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.region) sp.set('region', state.region);
  if (state.technique) sp.set('technique', state.technique);
  if (state.force) sp.set('force', state.force);
  if (state.confidence) sp.set('confidence', state.confidence);
  return sp;
}

export function buildLineageQuery(state) {
  const s = serializeLineageFilters(state).toString();
  return s ? `?${s}` : '';
}

export function removeLineageChip(state, stateKey) {
  if (stateKey === 'q') return { ...state, q: '' };
  return { ...state, [stateKey]: null };
}

export function clearLineageFilters() {
  return { q: '', region: null, technique: null, force: null, confidence: null };
}

export function matchesLineageFilters(lin, state) {
  const kebab = (s) => s.toLowerCase().replace(/_/g, '-');
  if (state.region) {
    const regions = [...(lin.originRegions ?? []), ...(lin.relatedRegions ?? [])].map(kebab);
    if (!regions.includes(kebab(state.region))) return false;
  }
  if (state.technique) {
    if (!(lin.techniques ?? []).map(kebab).includes(kebab(state.technique))) return false;
  }
  if (state.force) {
    if (!(lin.historicalForces ?? []).map(kebab).includes(kebab(state.force))) return false;
  }
  if (state.confidence && (lin.confidenceLevel ?? '') !== state.confidence) return false;
  if (state.q) {
    const needle = state.q.toLowerCase();
    const hay = [
      lin.name,
      lin.shortDescription ?? '',
      lin.conceptSummary ?? '',
      ...(lin.techniques ?? []),
      ...(lin.originRegions ?? []),
      ...(lin.relatedRegions ?? []),
      ...(lin.representativeDishes ?? []),
    ].join(' ').toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function applyLineageFilter(lineages, state) {
  return lineages.filter((l) => matchesLineageFilters(l, state));
}

export function recoveryLinks(domain) {
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

export function mapBrowseHref(domain) {
  return domain === 'geo' ? '/map' : `${ATLAS_ORIGIN}/map`;
}

export function safeQueryEncode(value, maxLen = 200) {
  return encodeURIComponent((value ?? '').trim().slice(0, maxLen));
}

export function absoluteDishesIndexHref(domain, query = '') {
  const q = query.trim();
  const suffix = q ? `?q=${safeQueryEncode(q)}` : '';
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes${suffix}`;
  return `/dishes${suffix}`;
}
