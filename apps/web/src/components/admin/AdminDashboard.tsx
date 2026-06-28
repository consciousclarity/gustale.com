/**
 * AdminDashboard — control-center overview for /admin.
 *
 * Client island (mounted client:load): admin pages ship as static HTML,
 * so real data is fetched after hydration against the same-origin
 * /api/admin/* endpoints (cookies are sent automatically). Mirrors the
 * AdminDishList island pattern.
 *
 * Primary data source: GET /api/admin/stats (aggregate counts + content
 * health). If that endpoint isn't present yet (older API deploy) the
 * dashboard degrades gracefully, deriving the counts it can from
 * /api/admin/dishes + /api/admin/lookups and marking the unknown
 * content-health metrics as unavailable rather than faking them.
 *
 * Styling comes from src/styles/admin.css (loaded by AdminLayout); this
 * component only emits the `.a-*` / `.adm-*` class names.
 */
import { useEffect, useState } from 'react';
import type {
  AdminStatsResponse,
  AdminDishSummary,
  AdminDishListResponse,
  AdminLookupsResponse,
} from '../../lib/api';

type Phase = 'loading' | 'ready' | 'error';

// -1 marks a metric that can't be computed without the stats endpoint.
const UNKNOWN = -1;

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
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

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  draft: 'Draft',
  archived: 'Archived',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span className={`a-badge a-badge--${status}`}>
      <span className="a-badge__dot" />
      {label}
    </span>
  );
}

// ── thin stroke icon set ──────────────────────────────────────────────────
const ICON_PATHS: Record<string, React.ReactNode> = {
  dishes: (<><path d="M3 11h14" /><path d="M10 4a6 6 0 0 1 6 6H4a6 6 0 0 1 6-6Z" /><path d="M6 16h8" /></>),
  families: (<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>),
  lineages: (<><circle cx="5" cy="5" r="2" /><circle cx="15" cy="15" r="2" /><path d="M6.5 6.5 13.5 13.5" /><path d="M13 5h2v2" /></>),
  regions: (<><circle cx="10" cy="10" r="7" /><path d="M3 10h14" /><path d="M10 3c2.5 2 2.5 12 0 14M10 3c-2.5 2-2.5 12 0 14" /></>),
  ingredients: (<><path d="M10 3v6" /><circle cx="10" cy="13" r="4" /><path d="M8 3h4" /></>),
  categories: (<><path d="M3 5h14M3 10h14M3 15h9" /></>),
  plus: (<path d="M10 4v12M4 10h12" />),
  edit: (<path d="M13 4l3 3-9 9H4v-3l9-9Z" />),
  review: (<><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></>),
  photo: (<><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.5" r="1.5" /><path d="M3 14l4-3 3 2 3-3 4 4" /></>),
  doc: (<><path d="M5 3h7l3 3v11H5z" /><path d="M12 3v3h3" /><path d="M7 10h6M7 13h6" /></>),
  source: (<><path d="M5 4h8a2 2 0 0 1 2 2v10H7a2 2 0 0 1-2-2z" /><path d="M8 8h4M8 11h4" /></>),
  pin: (<><path d="M10 2a5 5 0 0 0-5 5c0 3.6 5 11 5 11s5-7.4 5-11a5 5 0 0 0-5-5Z" /><circle cx="10" cy="7" r="1.6" /></>),
  chevron: (<path d="M7 4l6 6-6 6" />),
  arrow: (<><path d="M4 10h12" /><path d="M11 5l5 5-5 5" /></>),
  alert: (<><path d="M10 3l8 14H2L10 3Z" /><path d="M10 8v4M10 14.5v.5" /></>),
};

function Icon({ name, size = 18 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// ── data loading ──────────────────────────────────────────────────────────
async function fetchJson<T>(path: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export function AdminDashboard() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [recent, setRecent] = useState<AdminDishSummary[]>([]);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setPhase('loading');
    setError('');

    const statsRes = await fetchJson<AdminStatsResponse>('/api/admin/stats');
    if (statsRes.status === 401) {
      setError('Your admin session has expired. Please sign in again to continue.');
      setPhase('error');
      return;
    }

    if (statsRes.ok && statsRes.data) {
      const recentRes = await fetchJson<AdminDishListResponse>('/api/admin/dishes?limit=8');
      setStats(statsRes.data);
      setRecent(recentRes.data?.dishes ?? []);
      setDegraded(false);
      setPhase('ready');
      return;
    }

    // Stats endpoint missing/unavailable → derive what we can.
    await loadFallback();
  }

  async function loadFallback() {
    const [dishesRes, lookupsRes] = await Promise.all([
      fetchJson<AdminDishListResponse>('/api/admin/dishes?limit=500'),
      fetchJson<AdminLookupsResponse>('/api/admin/lookups'),
    ]);

    if (dishesRes.status === 401 || lookupsRes.status === 401) {
      setError('Your admin session has expired. Please sign in again to continue.');
      setPhase('error');
      return;
    }
    if (!dishesRes.ok || !dishesRes.data) {
      setError(
        dishesRes.status === 0
          ? 'Could not reach the admin API. Check your connection and try again.'
          : `The admin API returned an error (${dishesRes.status}).`,
      );
      setPhase('error');
      return;
    }

    const all = dishesRes.data.dishes;
    const lk = lookupsRes.data;
    const count = (s: string) => all.filter((d) => d.status === s).length;

    const derived: AdminStatsResponse = {
      dishes: {
        total: dishesRes.data.total,
        published: count('published'),
        draft: count('draft'),
        archived: count('archived'),
      },
      taxonomy: {
        categories: lk?.categories.length ?? 0,
        families: lk?.categories.filter((c) => c.kind === 'family').length ?? 0,
        lineages: lk?.preparationMethods.length ?? 0,
        regions: lk?.geoEntities.length ?? 0,
        ingredients: lk?.ingredients.length ?? 0,
        tags: 0,
      },
      media: { total: 0 },
      health: {
        missingDescription: all.filter((d) => !d.shortDescription).length,
        missingOrigin: all.filter((d) => !d.originName).length,
        missingPhoto: UNKNOWN,
        missingSources: UNKNOWN,
      },
    };

    setStats(derived);
    setRecent([...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8));
    setDegraded(true);
    setPhase('ready');
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="adm-dash">
      <header className="a-pagehead">
        <p className="a-eyebrow">Control center</p>
        <h1>Atlas <em>admin</em></h1>
        <p className="a-pagehead__lede">
          Manage dishes, taxonomy and provenance across the Gustale culinary archive — the
          internal editing surface for the encyclopedia.
        </p>
      </header>

      {phase === 'loading' && <DashboardSkeleton />}

      {phase === 'error' && (
        <div className="a-empty a-empty--error">
          <div className="a-empty__icon"><Icon name="alert" size={26} /></div>
          <h3>Couldn’t load the dashboard</h3>
          <p>{error}</p>
          <button className="a-btn a-btn--accent" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {phase === 'ready' && stats && (
        <>
          {degraded && (
            <div className="adm-note" role="status">
              <span className="adm-note__icon"><Icon name="alert" size={17} /></span>
              <span>
                <b>Showing partial data.</b> The aggregate stats service isn’t available on this
                deploy yet, so photo and source coverage are hidden. Counts below are derived from
                the dish and taxonomy lists.
              </span>
            </div>
          )}

          {/* KPI band */}
          <div className="adm-kpis">
            <Kpi label="Total dishes" num={stats.dishes.total} icon="dishes" accent
                 sub={<>in the archive</>} />
            <Kpi label="Published" num={stats.dishes.published}
                 sub={<>live on the site</>} />
            <Kpi label="In draft" num={stats.dishes.draft}
                 sub={<>awaiting review</>} />
            <Kpi label="Archived" num={stats.dishes.archived}
                 sub={<>hidden entries</>} />
          </div>

          {/* Quick actions */}
          <div className="a-section-rule"><h2>Quick actions</h2></div>
          <div className="adm-actions">
            <Action href="/dishes/new" icon="plus" primary title="Add new dish" sub="Create a dish entry" />
            <Action href="/admin/dishes" icon="edit" title="Edit dishes" sub="Browse &amp; edit all" />
            <Action href="/admin/dishes" icon="review" title="Review incomplete" sub={`${stats.dishes.draft} in draft`} />
            <Action href="/families" icon="families" title="Manage families" sub="Dish-type groups" />
            <Action href="/lineages" icon="lineages" title="Manage lineages" sub="Preparation methods" />
          </div>

          {/* Manage hub */}
          <div className="a-section-rule">
            <h2>Manage</h2>
            <span className="a-rule-count">{stats.dishes.total} dishes · {stats.taxonomy.categories} categories</span>
          </div>
          <div className="a-hub-grid">
            <HubTile href="/admin/dishes" icon="dishes" title="Dishes" count={stats.dishes.total}
                     unit="entries" cta="Manage"
                     desc="Create and edit dish entries, descriptions and provenance." />
            <HubTile href="/families" icon="families" title="Families" count={stats.taxonomy.families}
                     unit="categories" cta="Browse"
                     desc="Dish-type categories and groupings across the archive." />
            <HubTile href="/lineages" icon="lineages" title="Lineages" count={stats.taxonomy.lineages}
                     unit="methods" cta="Browse"
                     desc="Preparation methods and how dish ideas travel and evolve." />
            <HubTile href="/regions" icon="regions" title="Regions" count={stats.taxonomy.regions}
                     unit="places" cta="Browse"
                     desc="Countries and regions of culinary origin." />
            <HubTile icon="ingredients" title="Ingredients" count={stats.taxonomy.ingredients}
                     unit="names" soon
                     desc="Canonical ingredient list. In-admin editing coming soon." />
            <HubTile icon="categories" title="Categories" count={stats.taxonomy.categories}
                     unit="terms" soon
                     desc="The full classification taxonomy. In-admin editing coming soon." />
          </div>

          {/* Content health */}
          <div className="a-section-rule">
            <h2>Content health</h2>
            <span className="a-rule-count">gaps to review</span>
          </div>
          <div className="adm-health">
            <HealthCard name="Missing photos" icon="photo" num={stats.health.missingPhoto} />
            <HealthCard name="Missing descriptions" icon="doc" num={stats.health.missingDescription} />
            <HealthCard name="Missing sources" icon="source" num={stats.health.missingSources} />
            <HealthCard name="No origin set" icon="pin" num={stats.health.missingOrigin} />
          </div>

          {/* Recently updated */}
          <div className="a-section-rule">
            <h2>Recently updated</h2>
            <span className="a-rule-count">last {recent.length} {recent.length === 1 ? 'change' : 'changes'}</span>
          </div>
          {recent.length === 0 ? (
            <div className="a-empty">
              <div className="a-empty__icon"><Icon name="dishes" size={24} /></div>
              <h3>No dishes yet</h3>
              <p>Create your first dish entry to start building the archive.</p>
              <a className="a-btn a-btn--accent" href="/dishes/new">Add a dish</a>
            </div>
          ) : (
            <div className="a-recent">
              {recent.map((d) => (
                <a key={d.slug} className="a-recent__row" href={`/admin/dishes/${d.slug}`}>
                  <span className="a-recent__name">{d.canonicalName}</span>
                  <span className="a-recent__origin">{d.originName ?? '—'}</span>
                  <StatusBadge status={d.status} />
                  <span className="a-recent__date">{formatRelative(d.updatedAt)}</span>
                  <span className="a-recent__chev"><Icon name="chevron" size={14} /></span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── presentational sub-components ──────────────────────────────────────────
function Kpi({
  label, num, sub, icon, accent,
}: { label: string; num: number; sub?: React.ReactNode; icon?: keyof typeof ICON_PATHS; accent?: boolean }) {
  return (
    <div className={`adm-kpi${accent ? ' adm-kpi--accent' : ''}`}>
      <div className="adm-kpi__top">
        <span className="adm-kpi__label">{label}</span>
        {icon && <span className="adm-kpi__icon"><Icon name={icon} size={17} /></span>}
      </div>
      <span className="adm-kpi__num">{num.toLocaleString()}</span>
      {sub && <span className="adm-kpi__sub">{sub}</span>}
    </div>
  );
}

function Action({
  href, icon, title, sub, primary,
}: { href: string; icon: keyof typeof ICON_PATHS; title: string; sub: string; primary?: boolean }) {
  return (
    <a className={`adm-action${primary ? ' adm-action--primary' : ''}`} href={href}>
      <span className="adm-action__icon"><Icon name={icon} size={18} /></span>
      <span className="adm-action__txt">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
    </a>
  );
}

function HubTile({
  href, icon, title, count, unit, desc, cta = 'Open', soon,
}: {
  href?: string; icon: keyof typeof ICON_PATHS; title: string; count: number;
  unit: string; desc: string; cta?: string; soon?: boolean;
}) {
  const inner = (
    <>
      <div className="a-hub-tile__top">
        <span className="a-hub-tile__icon"><Icon name={icon} size={20} /></span>
        {soon ? (
          <span className="a-soon-badge">Soon</span>
        ) : (
          <span className="a-hub-tile__count">{count.toLocaleString()} <i>{unit}</i></span>
        )}
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <span className="a-hub-tile__go">
        {soon ? `${count.toLocaleString()} ${unit}` : cta}
        {!soon && <Icon name="arrow" size={13} />}
      </span>
    </>
  );
  if (soon || !href) {
    return <div className="a-hub-tile a-hub-tile--soon" aria-disabled="true">{inner}</div>;
  }
  return <a className="a-hub-tile" href={href}>{inner}</a>;
}

function HealthCard({
  name, icon, num,
}: { name: string; icon: keyof typeof ICON_PATHS; num: number }) {
  const unknown = num === UNKNOWN;
  const clear = num === 0;
  const pipClass = unknown
    ? 'adm-health__pip adm-health__pip--warn'
    : clear
      ? 'adm-health__pip'
      : 'adm-health__pip adm-health__pip--warn';
  const numClass = unknown
    ? 'adm-health__num adm-health__num--muted'
    : clear
      ? 'adm-health__num adm-health__num--clear'
      : 'adm-health__num';

  const body = (
    <>
      <div className="adm-health__top">
        <span className={pipClass} />
        <span className="adm-health__name">{name}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--sub)', opacity: 0.55 }}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <span className={numClass}>{unknown ? '—' : num.toLocaleString()}</span>
      <span className="adm-health__foot">
        {unknown ? (
          <>Needs the stats service</>
        ) : clear ? (
          <>All set</>
        ) : (
          <>Review {num === 1 ? 'it' : 'them'} <Icon name="arrow" size={12} /></>
        )}
      </span>
    </>
  );

  // Only the actionable (non-zero, known) cards link to the filtered list.
  if (!unknown && !clear) {
    return <a className="adm-health__card" href="/admin/dishes">{body}</a>;
  }
  return <div className="adm-health__card">{body}</div>;
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="adm-kpis is-loading">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="a-skel-block" />)}
      </div>
      <div className="a-section-rule"><h2 style={{ opacity: 0.4 }}>Loading…</h2></div>
      <div className="a-hub-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="a-skel-block" style={{ minHeight: 168 }} />
        ))}
      </div>
    </div>
  );
}
