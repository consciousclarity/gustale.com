import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  applyLineageFilter,
  browseStatusMessage,
  buildLineageQuery,
  clearLineageFilters,
  lineageFilterChips,
  parseLineageFilters,
  recoveryLinks,
  removeLineageChip,
  type LineageFilterState,
} from '../lib/browse';
import { currentDomain } from '../lib/domain';
import type { LineageSummary } from '../types/lineage';

const CONFIDENCE_LABELS: Record<string, string> = {
  documented: 'Documented',
  likely: 'Likely related',
  probable: 'Probable',
  possible: 'Possible influence',
  uncertain: 'Uncertain',
  parallel_evolution: 'Parallel evolution',
};

const FORCE_LABELS: Record<string, string> = {
  migration: 'Migration',
  trade_route: 'Trade route',
  empire: 'Empire',
  colonization: 'Colonization',
  diaspora: 'Diaspora',
  religious_exchange: 'Religious exchange',
  port_city_exchange: 'Port city exchange',
  agricultural_spread: 'Agricultural spread',
  technological_change: 'Technological change',
  local_adaptation: 'Local adaptation',
  parallel_evolution: 'Parallel evolution',
  cultural_exchange: 'Cultural exchange',
  nomadic_pastoral: 'Nomadic / pastoral',
  war_and_displacement: 'War & displacement',
};

function labelFor(map: Record<string, string>, key: string): string {
  return map[key] ?? key.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

function kebab(s: string): string {
  return s.toLowerCase().replace(/_/g, '-');
}

export interface LineageBrowseProps {
  lineages: LineageSummary[];
  regions: string[];
  techniques: string[];
  historicalForces: string[];
  confidenceLevels: string[];
}

export function LineageBrowse({
  lineages,
  regions,
  techniques,
  historicalForces,
  confidenceLevels,
}: LineageBrowseProps) {
  const domain = currentDomain();
  const reactId = useId().replace(/:/g, '');
  const filtersId = `lin-filters-${reactId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LineageFilterState>(() => {
    if (typeof window === 'undefined') return clearLineageFilters();
    return parseLineageFilters(new URLSearchParams(window.location.search));
  });

  const visible = useMemo(() => applyLineageFilter(lineages, state), [lineages, state]);
  const chips = lineageFilterChips(state);
  const recovery = recoveryLinks(domain);

  useEffect(() => {
    const qs = buildLineageQuery(state);
    const next = `${window.location.pathname}${qs}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) window.history.pushState({ lineage: state }, '', next);
  }, [state]);

  useEffect(() => {
    const onPop = () =>
      setState(parseLineageFilters(new URLSearchParams(window.location.search)));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  const status = browseStatusMessage({
    loading: false,
    failed: false,
    count: visible.length,
    query: state.q || chips.map((c) => c.value).join(', '),
    noun: 'lineages',
  });

  return (
    <div className="browse-shell">
      <div className="browse-toolbar browse-toolbar--island" data-browse-toolbar>
        <div className="browse-toolbar-row">
          <div className="browse-search">
            <label className="browse-search-sr" htmlFor="lin-browse-search">
              Search lineages
            </label>
            <input
              id="lin-browse-search"
              type="search"
              className="browse-search-field"
              placeholder="Search lineages, techniques, regions…"
              value={state.q}
              onChange={(e) => setState((s) => ({ ...s, q: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="browse-count" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          <button
            ref={triggerRef}
            type="button"
            className="browse-filters-btn"
            aria-controls={filtersId}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="browse-filters-btn-label">Filters</span>
            <span aria-hidden="true">▾</span>
            {chips.filter((c) => c.stateKey !== 'q').length > 0 && (
              <span className="browse-filters-btn-badge">
                {chips.filter((c) => c.stateKey !== 'q').length}
              </span>
            )}
          </button>
          {chips.length > 0 && (
            <button
              type="button"
              className="browse-clear"
              onClick={() => setState(clearLineageFilters())}
            >
              Clear all
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <ul className="browse-chips" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className="browse-chip"
                  onClick={() => setState((s) => removeLineageChip(s, chip.stateKey))}
                >
                  {chip.label}
                  <span aria-hidden="true"> ×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          ref={panelRef}
          id={filtersId}
          className="browse-filters-panel"
          hidden={!open}
          role="region"
          aria-label="Advanced lineage filters"
        >
          <div className="browse-filter-grid">
            <label>
              Region
              <select
                value={state.region ?? ''}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    region: e.target.value || null,
                  }))
                }
              >
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r} value={kebab(r)}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Technique
              <select
                value={state.technique ?? ''}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    technique: e.target.value || null,
                  }))
                }
              >
                <option value="">All techniques</option>
                {techniques.map((t) => (
                  <option key={t} value={kebab(t)}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Historical force
              <select
                value={state.force ?? ''}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    force: e.target.value || null,
                  }))
                }
              >
                <option value="">All forces</option>
                {historicalForces.map((f) => (
                  <option key={f} value={kebab(f)}>
                    {labelFor(FORCE_LABELS, f)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Confidence
              <select
                value={state.confidence ?? ''}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    confidence: e.target.value || null,
                  }))
                }
              >
                <option value="">All levels</option>
                {confidenceLevels.map((c) => (
                  <option key={c} value={c}>
                    {CONFIDENCE_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="browse-banner" role="status">
          <p>
            No lineages match
            {state.q ? ` “${state.q}”` : ' these filters'}.
          </p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setState(clearLineageFilters())}
          >
            Clear all
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

      <section className="lin-grid" aria-live="polite">
        {visible.map((lin) => (
          <article key={lin.slug} className="lin-card">
            <header className="lin-card__head">
              <span className="lin-card__slug mono-sub">{lin.slug}</span>
              <span className={`lin-card__conf lin-card__conf--${lin.confidenceLevel}`}>
                {CONFIDENCE_LABELS[lin.confidenceLevel] ?? lin.confidenceLevel}
              </span>
            </header>
            <h2 className="lin-card__title">
              <a href={`/lineages/${lin.slug}`}>{lin.name}</a>
            </h2>
            {lin.conceptSummary && (
              <p className="lin-card__concept">{lin.conceptSummary}</p>
            )}
            <div className="lin-card__meta">
              <span>
                <b>{lin.dishCount}</b> dishes
              </span>
            </div>
            <a href={`/lineages/${lin.slug}`} className="lin-card__cta">
              Open the lineage <span aria-hidden="true">→</span>
            </a>
          </article>
        ))}
      </section>
    </div>
  );
}
