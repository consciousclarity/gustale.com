/**
 * ContributorSubmissionsList — read-only list of the caller's own
 * edit_history rows (create/update actions on dishes).
 *
 * Fetches GET /api/dashboard/submissions on mount. The endpoint does not
 * join to `dishes` (kept slim), so this component resolves the target
 * dish slug by issuing a single batched lookup against the existing
 * public GET /api/dishes/:slug endpoint when the link is visible. To
 * avoid blocking the first paint, the list renders without links first
 * and enriches with slugs as they resolve.
 *
 * For the v1 dashboard shell, we keep it minimal: render what the
 * submissions endpoint returned, show targetId, and rely on the
 * already-existing edit-history `comment` for human context.
 */
import { useEffect, useState } from 'react';
import {
  ApiError,
  type DashboardSubmission,
  type DashboardSubmissionsResponse,
} from '../../lib/api';

interface Props {
  emptyTitle?: string;
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

function actionLabel(action: string): string {
  switch (action) {
    case 'create': return 'Created draft';
    case 'update': return 'Updated';
    default: return action;
  }
}

export function ContributorSubmissionsList({
  emptyTitle = 'No submissions yet',
  emptyBody = 'When you edit a dish, your activity will be recorded here.',
}: Props) {
  const [data, setData] = useState<DashboardSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await import('../../lib/api').then((m) =>
          m.getDashboardSubmissions({ limit: 50 }),
        );
        if (cancelled) return;
        setData(res.submissions);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setError('unauthorized');
        } else {
          setError(err instanceof Error ? err.message : 'Could not load submissions.');
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
    return <p className="cd-list__hint">Loading submissions…</p>;
  }
  if (error === 'unauthorized') {
    return (
      <p className="cd-list__hint">
        <a className="cd-signin" href="/login?redirect=/dashboard">
          Sign in to view your submissions →
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
    <ul className="cd-list" aria-label="Your submitted edits">
      {data.map((s) => (
        <li key={s.id} className="cd-list__row">
          <span className="cd-list__plain">
            <span className="cd-list__name">{actionLabel(s.action)}</span>
            <span className="cd-list__meta">
              <span className="cd-list__sep">·</span>
              <span className="cd-list__date">{formatDate(s.createdAt)}</span>
              {s.comment ? (
                <>
                  <span className="cd-list__sep">·</span>
                  <span className="cd-list__comment">{s.comment}</span>
                </>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default ContributorSubmissionsList;