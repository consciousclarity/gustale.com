import { useEffect, useMemo, useState } from 'react';
import {
  browseStatusMessage,
  buildFamilyDirectory,
  familyDetailHref,
  filterFamilyDirectory,
  mapBrowseHref,
  recoveryLinks,
  type FamilyEntry,
  type LikeableDish,
} from '../lib/browse';
import { currentDomain } from '../lib/domain';

export interface FamilyDirectoryProps {
  dishes: LikeableDish[];
  countriesHref?: string;
}

export function FamilyDirectory({
  dishes,
  countriesHref = '/regions',
}: FamilyDirectoryProps) {
  const domain = currentDomain();
  const all = useMemo(() => buildFamilyDirectory(dishes), [dishes]);
  const [q, setQ] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });
  const [failed] = useState(false);

  const visible: FamilyEntry[] = useMemo(
    () => filterFamilyDirectory(all, q),
    [all, q],
  );
  const recovery = recoveryLinks(domain);
  const mapHref = mapBrowseHref(domain);

  useEffect(() => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    const next = `${window.location.pathname}${qs}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) window.history.replaceState({}, '', next);
  }, [q]);

  useEffect(() => {
    const onPop = () => {
      setQ(new URLSearchParams(window.location.search).get('q') ?? '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const status = browseStatusMessage({
    loading: false,
    failed,
    count: visible.length,
    query: q,
    noun: 'families',
  });

  return (
    <div className="browse-shell">
      <div className="browse-toolbar browse-toolbar--island" data-browse-toolbar>
        <div className="browse-toolbar-row">
          <div className="browse-search">
            <label className="browse-search-sr" htmlFor="family-browse-search">
              Search families
            </label>
            <input
              id="family-browse-search"
              type="search"
              className="browse-search-field"
              placeholder="Search families or dishes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="browse-count" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          {q && (
            <button type="button" className="browse-clear" onClick={() => setQ('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      <p className="browse-crosslinks">
        <a href={countriesHref}>Countries</a>
        <span aria-hidden="true"> · </span>
        <a href={mapHref}>Open the map</a>
      </p>

      {visible.length === 0 && (
        <div className="browse-banner" role="status">
          <p>No families match{q ? ` “${q}”` : ''}.</p>
          <button type="button" className="btn-outline" onClick={() => setQ('')}>
            Clear search
          </button>
          <ul className="browse-recovery">
            {recovery.primary.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="browse-dir">
        {visible.map((f) => (
          <li key={f.slug}>
            <a className="browse-dir-card" href={familyDetailHref(f.slug)}>
              <div className="browse-dir-card__top">
                <h2>{f.name}</h2>
                <span className="browse-dir-card__count">
                  {f.count} {f.count === 1 ? 'dish' : 'dishes'}
                </span>
              </div>
              {f.dishNames.length > 0 && (
                <p className="browse-dir-card__meta">
                  {f.dishNames.slice(0, 4).join(' · ')}
                  {f.dishNames.length > 4 ? '…' : ''}
                </p>
              )}
              {f.sampleOrigins.length > 0 && (
                <p className="browse-dir-card__sub">
                  {f.sampleOrigins.join(', ')}
                </p>
              )}
              <span className="browse-dir-card__go">
                Open family <span aria-hidden="true">→</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
