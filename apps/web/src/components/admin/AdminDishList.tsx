import { useState } from 'react';

interface DishListItem {
  id: string;
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  status: 'draft' | 'published' | 'archived';
  viewCount: number;
  updatedAt: string;
  originGeoId: string | null;
  originName: string | null;
}

interface Props {
  initialDishes: DishListItem[];
  initialTotal: number;
  apiBase: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'badge-draft',
  published: 'badge-published',
  archived: 'badge-archived',
};

export function AdminDishList({ initialDishes, initialTotal, apiBase }: Props) {
  const adminKey = (typeof window !== 'undefined'
    ? (window as unknown as { ENV_ADMIN_KEY?: string }).ENV_ADMIN_KEY ?? ''
    : '');

  const [dishes, setDishes] = useState(initialDishes);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(qp: string = '') {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/dishes?limit=200${qp}`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { dishes: DishListItem[]; total: number };
      setDishes(data.dishes);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    load('?' + params.toString());
  }

  return (
    <div>
      {/* Search + filter bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: '200px' }}
          placeholder="Search dishes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input"
          style={{ width: '140px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button type="submit" className="btn btn-accent">Search</button>
      </form>

      {/* Table */}
      <div className="table-wrap">
        <table className="edit-table">
          <thead>
            <tr>
              <th>Dish</th>
              <th style={{ width: '120px' }}>Origin</th>
              <th style={{ width: '100px' }}>Status</th>
              <th style={{ width: '80px' }}>Views</th>
              <th style={{ width: '120px' }}>Updated</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--sub)', padding: '2rem' }}>
                  Loading…
                </td>
              </tr>
            ) : dishes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--sub)', padding: '2rem' }}>
                  No dishes found.
                </td>
              </tr>
            ) : (
              dishes.map((dish) => (
                <tr key={dish.id}>
                  <td>
                    <a
                      href={`/admin/dishes/${dish.slug}`}
                      style={{ fontWeight: 500, color: 'var(--accent)' }}
                    >
                      {dish.canonicalName}
                    </a>
                    {dish.shortDescription && (
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--sub)' }}>
                        {dish.shortDescription.slice(0, 80)}{dish.shortDescription.length > 80 ? '…' : ''}
                      </p>
                    )}
                  </td>
                  <td style={{ color: 'var(--sub)', fontSize: '0.875rem' }}>
                    {dish.originName ?? <span style={{ color: 'var(--sub)', fontStyle: 'italic' }}>unknown</span>}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[dish.status] ?? ''}`}>
                      {STATUS_LABELS[dish.status] ?? dish.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--sub)', fontSize: '0.875rem' }}>{dish.viewCount}</td>
                  <td style={{ color: 'var(--sub)', fontSize: '0.8rem' }}>
                    {new Date(dish.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <a href={`/admin/dishes/${dish.slug}`} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
                      Edit →
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mono-sub" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
        {loading ? '…' : `${total} dishes total`}
      </p>
    </div>
  );
}
