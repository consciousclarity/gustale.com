import { useEffect, useMemo, useState } from 'react';
import {
  browseStatusMessage,
  buildCountryDirectory,
  countryAlphaIndex,
  dishDetailHref,
  filterCountryDirectory,
  mapBrowseHref,
  recoveryLinks,
  type CountryEntry,
  type LikeableDish,
} from '../lib/browse';
import { currentDomain } from '../lib/domain';

export interface CountryDirectoryProps {
  dishes: LikeableDish[];
}

export function CountryDirectory({ dishes }: CountryDirectoryProps) {
  const domain = currentDomain();
  const all = useMemo(() => buildCountryDirectory(dishes), [dishes]);
  const [q, setQ] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const filtered = useMemo(() => filterCountryDirectory(all, q), [all, q]);
  const visible = useMemo(() => {
    if (!activeLetter) return filtered;
    return filtered.filter((c) => c.letter === activeLetter);
  }, [filtered, activeLetter]);
  const letters = useMemo(() => countryAlphaIndex(filtered), [filtered]);
  const recovery = recoveryLinks(domain);
  const mapHref = mapBrowseHref(domain);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (activeLetter) sp.set('letter', activeLetter);
    const qs = sp.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) window.history.replaceState({}, '', next);
  }, [q, activeLetter]);

  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setQ(sp.get('q') ?? '');
      setActiveLetter(sp.get('letter'));
    };
    // seed letter from URL once
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('letter')) setActiveLetter(sp.get('letter'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const status = browseStatusMessage({
    loading: false,
    failed: false,
    count: visible.length,
    query: q || activeLetter || '',
    noun: 'countries',
  });

  return (
    <div className="browse-shell">
      <div className="browse-toolbar browse-toolbar--island" data-browse-toolbar>
        <div className="browse-toolbar-row">
          <div className="browse-search">
            <label className="browse-search-sr" htmlFor="country-browse-search">
              Search countries
            </label>
            <input
              id="country-browse-search"
              type="search"
              className="browse-search-field"
              placeholder="Search countries or dishes…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveLetter(null);
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="browse-count" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          {(q || activeLetter) && (
            <button
              type="button"
              className="browse-clear"
              onClick={() => {
                setQ('');
                setActiveLetter(null);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <nav className="browse-alpha" aria-label="Jump by letter">
        {letters.map((letter) => (
          <button
            key={letter}
            type="button"
            className={`browse-alpha__btn${activeLetter === letter ? ' is-on' : ''}`}
            onClick={() =>
              setActiveLetter((cur) => (cur === letter ? null : letter))
            }
            aria-pressed={activeLetter === letter}
          >
            {letter}
          </button>
        ))}
      </nav>

      <p className="browse-crosslinks">
        <a href={mapHref}>Open the map</a>
        <span aria-hidden="true"> · </span>
        <a href="/families">Food families</a>
      </p>

      {visible.length === 0 && (
        <div className="browse-banner" role="status">
          <p>No countries match{q ? ` “${q}”` : ''}.</p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setQ('');
              setActiveLetter(null);
            }}
          >
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
        {visible.map((c: CountryEntry) => (
          <li key={c.name} id={`country-${c.letter}-${c.name.replace(/\s+/g, '-')}`}>
            <article className="browse-dir-card browse-dir-card--static">
              <div className="browse-dir-card__top">
                <h2>{c.name}</h2>
                <span className="browse-dir-card__count">
                  {c.count} {c.count === 1 ? 'dish' : 'dishes'}
                </span>
              </div>
              {c.dishNames.length > 0 && (
                <ul className="browse-dir-dishes">
                  {c.dishNames.slice(0, 5).map((name) => {
                    const dish = dishes.find((d) => d.canonicalName === name);
                    return (
                      <li key={name}>
                        {dish?.slug ? (
                          <a href={dishDetailHref(dish.slug)}>{name}</a>
                        ) : (
                          name
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
