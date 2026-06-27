/**
 * AdminDishList — Phase 4 (Admin Dish Editor redo)
 *
 * Searchable, status-filterable list of dishes for the admin UI. Shows
 * the first batch via SSR-supplied initialDishes, then supports client-
 * side filter/search via /api/admin/dishes.
 *
 * Styling: Tailwind utility classes consistent with the existing
 * Gustale React components (SignInForm, NewDishForm). No new CSS.
 */
import { useState } from 'react';
import type { AdminDishSummary } from '../../lib/api';

interface Props {
  initialDishes: AdminDishSummary[];
  initialTotal: number;
  apiBase: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-900 border-amber-200',
  published: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function AdminDishList({ initialDishes, initialTotal, apiBase }: Props) {
  const [dishes, setDishes] = useState<AdminDishSummary[]>(initialDishes);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(params: { q?: string; status?: string } = {}) {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams();
      search.set('limit', '200');
      if (params.q) search.set('q', params.q);
      if (params.status) search.set('status', params.status);
      const res = await fetch(`${apiBase}/api/admin/dishes?${search.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { dishes: AdminDishSummary[]; total: number };
      setDishes(data.dishes);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    load({ q: q || undefined, status: statusFilter || undefined });
  }

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-3 mb-5"
      >
        <input
          type="search"
          className="flex-1 min-w-[200px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder="Search dishes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search dishes"
        />
        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        <div className="text-sm text-slate-500" aria-live="polite">
          {loading ? '…' : `${total} ${total === 1 ? 'dish' : 'dishes'}`}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Error: {error}
        </div>
      )}

      <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {dishes.map((d) => (
          <a
            key={d.id}
            href={`/admin/dishes/${d.slug}`}
            className="flex items-start gap-4 p-4 transition-colors hover:bg-slate-50"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900">{d.canonicalName}</div>
              <div className="mt-0.5 font-mono text-xs text-slate-500">{d.slug}</div>
              {d.shortDescription && (
                <div className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {d.shortDescription}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                  STATUS_BADGE[d.status] ?? STATUS_BADGE.published
                }`}
              >
                {STATUS_LABELS[d.status] ?? d.status}
              </span>
              <span className="text-xs text-slate-500">
                {d.viewCount.toLocaleString()} views
              </span>
              <span className="text-xs text-slate-400">{formatRelative(d.updatedAt)}</span>
            </div>
          </a>
        ))}
        {dishes.length === 0 && !loading && (
          <div className="p-8 text-center text-sm text-slate-500">
            No dishes match your filters.
          </div>
        )}
      </div>
    </div>
  );
}