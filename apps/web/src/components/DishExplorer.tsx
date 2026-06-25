import { useEffect, useMemo, useState } from 'react';
import { DishCard, SearchInput } from '@gustale/ui';
import { listDishes, ApiError } from '../lib/api';
import type { DishListResponse, DishSummary } from '../types/dish';

/**
 * Client-side dish explorer. Renders a search input and a grid of cards.
 * Initial data is passed in (server-rendered) for SEO + first paint;
 * subsequent filtering and pagination happen in the browser.
 */
export interface DishExplorerProps {
  initial: DishListResponse;
}

const PAGE_SIZE = 24;

function parseStructuredQuery(raw: string): {
  q: string;
  origin: string[];
  ingredient: string[];
  technique: string[];
  region: string[];
  category: string[];
} {
  const tokens = raw.match(/(\S+):(\S+)/g) ?? [];
  const freetext = raw.replace(/(\S+):(\S+)/g, '').trim();
  const filters = {
    origin: [] as string[],
    ingredient: [] as string[],
    technique: [] as string[],
    region: [] as string[],
    category: [] as string[],
  };
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key in filters) (filters as any)[key].push(val);
  }
  return { q: freetext, ...filters };
}

export function DishExplorer({ initial }: DishExplorerProps) {
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    const sp = new URLSearchParams(window.location.search);
    // Seed the search string from the URL so deep-links like
    // ?category=korean-cuisine (or ?origin=Japan) apply on first load.
    const parts: string[] = [];
    const q = sp.get('q');
    if (q) parts.push(q);
    for (const key of ['origin', 'ingredient', 'technique', 'region', 'category'] as const) {
      for (const val of sp.getAll(key)) {
        if (val) parts.push(`${key}:${val}`);
      }
    }
    return parts.join(' ');
  });
  const [data, setData] = useState<DishListResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search effect.
  useEffect(() => {
    const parsed = parseStructuredQuery(search);
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      listDishes({
        search: parsed.q.trim() || undefined,
        origin: parsed.origin[0],
        ingredient: parsed.ingredient[0],
        technique: parsed.technique[0],
        region: parsed.region[0],
        category: parsed.category[0],
        limit: PAGE_SIZE,
      })
        .then((res) => setData(res))
        .catch((err: unknown) => {
          if (err instanceof ApiError) {
            setError(`API ${err.status}: ${err.message}`);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Unknown error');
          }
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  // Sync URL with parsed filters
  useEffect(() => {
    const parsed = parseStructuredQuery(search);
    const sp = new URLSearchParams();
    if (parsed.q) sp.set('q', parsed.q);
    if (parsed.origin.length) parsed.origin.forEach((v) => sp.append('origin', v));
    if (parsed.ingredient.length) parsed.ingredient.forEach((v) => sp.append('ingredient', v));
    if (parsed.technique.length) parsed.technique.forEach((v) => sp.append('technique', v));
    if (parsed.region.length) parsed.region.forEach((v) => sp.append('region', v));
    if (parsed.category.length) parsed.category.forEach((v) => sp.append('category', v));
    const qs = sp.toString();
    window.history.pushState({}, '', qs ? `?${qs}` : window.location.pathname);
  }, [search]);

  const dishes: DishSummary[] = useMemo(() => data?.dishes ?? [], [data]);

  const parsed = useMemo(() => parseStructuredQuery(search), [search]);
  const hasFilters =
    parsed.origin.length > 0 ||
    parsed.ingredient.length > 0 ||
    parsed.technique.length > 0 ||
    parsed.region.length > 0 ||
    parsed.category.length > 0;

  function removeFilter(key: string, val: string) {
    // E.g. "ramen origin:Japan technique:grilling" → remove "origin:Japan"
    const regex = new RegExp(`\\s*${key}:${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    setSearch((s) => s.replace(regex, '').trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            label="Search dishes"
            placeholder="Search by name, or use origin:Italy, ingredient:saffron, technique:grilling…"
          />
        </div>
        <div className="text-sm text-slate-500">
          {loading ? 'Searching…' : `${dishes.length} dishes`}
        </div>
      </div>

      {hasFilters && (
        <div className="filter-chips">
          {parsed.origin.map((v) => (
            <button
              key={`origin:${v}`}
              className="filter-chip"
              onClick={() => removeFilter('origin', v)}
              type="button"
            >
              origin:{v}
              <span className="fc-x">×</span>
            </button>
          ))}
          {parsed.ingredient.map((v) => (
            <button
              key={`ingredient:${v}`}
              className="filter-chip"
              onClick={() => removeFilter('ingredient', v)}
              type="button"
            >
              ingredient:{v}
              <span className="fc-x">×</span>
            </button>
          ))}
          {parsed.technique.map((v) => (
            <button
              key={`technique:${v}`}
              className="filter-chip"
              onClick={() => removeFilter('technique', v)}
              type="button"
            >
              technique:{v}
              <span className="fc-x">×</span>
            </button>
          ))}
          {parsed.region.map((v) => (
            <button
              key={`region:${v}`}
              className="filter-chip"
              onClick={() => removeFilter('region', v)}
              type="button"
            >
              region:{v}
              <span className="fc-x">×</span>
            </button>
          ))}
          {parsed.category.map((v) => (
            <button
              key={`category:${v}`}
              className="filter-chip"
              onClick={() => removeFilter('category', v)}
              type="button"
            >
              category:{v}
              <span className="fc-x">×</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {dishes.length === 0 && !loading && !error && (
        <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No dishes found.
        </div>
      )}

      {dishes.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((d) => (
            <li key={d.id}>
              <DishCard
                title={d.canonicalName}
                slug={d.slug}
                description={d.shortDescription}
                href={`/dishes/${d.slug}`}
                status={d.status}
                viewCount={d.viewCount}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
