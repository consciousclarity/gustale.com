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

export function DishExplorer({ initial }: DishExplorerProps) {
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('search') ?? '';
  });
  const [data, setData] = useState<DishListResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search effect.
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      listDishes({ search: search.trim() || undefined, limit: PAGE_SIZE })
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

  const dishes: DishSummary[] = useMemo(() => data?.dishes ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            label="Search dishes"
            placeholder="Search by name…"
          />
        </div>
        <div className="text-sm text-slate-500">
          {loading ? 'Searching…' : `${dishes.length} dishes`}
        </div>
      </div>

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
