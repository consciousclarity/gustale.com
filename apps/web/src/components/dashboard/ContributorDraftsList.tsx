/**
 * ContributorDraftsList — read-only list of the caller's draft dishes.
 *
 * Fetches GET /api/dashboard/drafts on mount. Renders a calm list of
 * {name · status · updatedAt} rows with a link to the dish's edit page.
 * Empty/error states mirror the editorial empty-state language used
 * elsewhere on the dashboard.
 */
import { useEffect, useState } from 'react';
import { ApiError, type DashboardDraft, type DashboardDraftsResponse } from '../../lib/api';

interface Props {
  /** Empty-state heading. */
  emptyTitle?: string;
  /** Empty-state body copy. */
  emptyBody?: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ContributorDraftsList({
  emptyTitle = 'No drafts yet',
  emptyBody = 'Drafts you create via “Add a dish” will appear here.',
}: Props) {
  const [data, setData] = useState<DashboardDraft[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await import('../../lib/api').then((m) =>
          m.getDashboardDrafts({ limit: 50 }),
        );
        if (cancelled) return;
        setData(res.drafts);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setError('unauthorized');
        } else {
          setError(err instanceof Error ? err.message : 'Could not load drafts.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="cd-list__hint">Loading drafts…</p>;
  }
  if (error === 'unauthorized') {
    return (
      <p className="cd-list__hint">
        <a className="cd-signin" href="/login?redirect=/dashboard">
          Sign in to view your drafts →
        </a>
      </p>
    );
  }
  if (error) {
    return <p className="cd-list__hint cd-list__hint--err">{error}</p>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="cd-empty">
        <p className="cd-empty__title">{emptyTitle}</p>
        <p className="cd-empty__body">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="cd-list" aria-label="Your drafts">
      {data.map((d) => (
        <li key={d.id} className="cd-list__row">
          <a className="cd-list__link" href={`/dishes/${d.slug}/edit`}>
            <span className="cd-list__name">{d.canonicalName}</span>
            <span className="cd-list__meta">
              <span className="cd-list__status">draft</span>
              <span className="cd-list__sep">·</span>
              <span className="cd-list__date">updated {formatDate(d.updatedAt)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default ContributorDraftsList;