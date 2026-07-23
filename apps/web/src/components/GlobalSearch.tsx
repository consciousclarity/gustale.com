import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  globalSearch,
  type SearchGroup,
  type SearchGroupType,
  type SearchHit,
} from '../lib/api';
import { currentDomain, type GustaleDomain } from '../lib/domain';
import {
  clampActiveIndex,
  resolveSearchHitHref,
  searchEmptyBrowseLinks,
  searchErrorBrowseLinks,
  searchHelpLinks,
  searchOptionId,
  searchStatusMessage,
  seeAllDishesHref,
  shouldHandleSlashShortcut,
  type SearchPlacement,
} from '../lib/searchNav';

const DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;
const GROUP_LABELS: Record<SearchGroupType, string> = {
  dish: 'Dishes',
  lineage: 'Lineages',
  ingredient: 'Ingredients',
  region: 'Regions',
};
const GROUP_ORDER: SearchGroupType[] = ['dish', 'lineage', 'ingredient', 'region'];

interface GlobalSearchProps {
  variant?: 'compact' | 'full';
  placement?: SearchPlacement;
}

type FlatHit = SearchHit & { groupType: SearchGroupType };

function mapGroups(groups: SearchGroup[], domain: GustaleDomain): SearchGroup[] {
  return groups.map((g) => ({
    ...g,
    results: g.results.map((hit: SearchHit) => ({
      ...hit,
      href: resolveSearchHitHref(hit.href, domain),
    })),
  }));
}

function flattenHits(groups: SearchGroup[]): FlatHit[] {
  const out: FlatHit[] = [];
  for (const t of GROUP_ORDER) {
    const g = groups.find((x) => x.type === t);
    if (!g) continue;
    for (const hit of g.results) {
      out.push({ ...hit, groupType: t });
    }
  }
  return out;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GlobalSearch({ variant = 'compact', placement = 'header' }: GlobalSearchProps) {
  const domain = currentDomain();
  const isGeo = domain === 'geo';

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborterRef = useRef<AbortController | null>(null);
  const reactId = useId().replace(/:/g, '');

  const searchLabel = isGeo ? 'Search the Gustale Atlas' : 'Search Gustale Recipes';
  const inputId = placement === 'drawer' ? 'gs-input-drawer' : 'gs-input-header';
  const popupId = `gs-popup-${placement}-${reactId}`;
  const listboxId = `gs-listbox-${placement}-${reactId}`;
  const statusId = `gs-status-${placement}-${reactId}`;
  const placeholder = isGeo
    ? placement === 'drawer' || variant === 'full'
      ? 'Search dishes, countries, lineages…'
      : 'Search Atlas'
    : placement === 'drawer' || variant === 'full'
      ? 'Search dishes, ingredients, lineages…'
      : 'Search';

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (debounced.length < MIN_QUERY_LENGTH) {
      setGroups(null);
      setUnavailable(false);
      setLoading(false);
      setActiveIdx(0);
      return;
    }
    setLoading(true);
    setUnavailable(false);

    if (aborterRef.current) aborterRef.current.abort();
    const ac = new AbortController();
    aborterRef.current = ac;

    globalSearch({ q: debounced, limit: 5 })
      .then((res) => {
        if (ac.signal.aborted) return;
        setGroups(mapGroups(res.groups, domain));
        setActiveIdx(0);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setUnavailable(true);
        setGroups(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [debounced, domain]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Desktop “/” focuses header search only — never register from drawer.
  useEffect(() => {
    if (placement !== 'header') return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!shouldHandleSlashShortcut(e.target)) return;
      e.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placement]);

  const flatHits = groups ? flattenHits(groups) : [];
  const flatCount = flatHits.length;
  const safeActiveIdx = clampActiveIndex(activeIdx, flatCount);

  useEffect(() => {
    if (activeIdx !== safeActiveIdx) setActiveIdx(safeActiveIdx);
  }, [activeIdx, safeActiveIdx]);

  const activeHit = flatCount > 0 ? flatHits[safeActiveIdx] : undefined;
  const activeOptionDomId = activeHit
    ? searchOptionId(placement, activeHit.groupType, activeHit.slug)
    : undefined;

  useEffect(() => {
    if (!open || !activeOptionDomId || flatCount === 0) return;
    const el = document.getElementById(activeOptionDomId);
    el?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [activeOptionDomId, open, flatCount, safeActiveIdx]);

  const queryReady = debounced.length >= MIN_QUERY_LENGTH;
  const showHelp = open && !queryReady;
  const showLoading = open && queryReady && loading;
  const showError = open && queryReady && !loading && unavailable;
  const showEmpty =
    open && queryReady && !loading && !unavailable && groups !== null && flatCount === 0;
  const showResults = open && queryReady && !loading && !unavailable && flatCount > 0;
  const showPopup = showHelp || showLoading || showError || showEmpty || showResults;
  const popupExpanded = Boolean(showPopup);

  const statusText = searchStatusMessage({
    open,
    queryLen: debounced.length,
    loading,
    unavailable,
    resultCount: !queryReady || (groups === null && !unavailable && !loading) ? null : flatCount,
    query: debounced,
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (open) {
          setOpen(false);
          inputRef.current?.focus();
        } else {
          inputRef.current?.blur();
        }
        return;
      }
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setOpen(true);
        return;
      }
      if (e.key === 'ArrowDown' && flatCount > 0) {
        e.preventDefault();
        setActiveIdx((i) => (clampActiveIndex(i, flatCount) + 1) % flatCount);
        return;
      }
      if (e.key === 'ArrowUp' && flatCount > 0) {
        e.preventDefault();
        setActiveIdx((i) => (clampActiveIndex(i, flatCount) - 1 + flatCount) % flatCount);
        return;
      }
      if (e.key === 'Enter' && flatCount > 0) {
        e.preventDefault();
        const target = flatHits[safeActiveIdx] ?? flatHits[0];
        if (target) window.location.href = target.href;
      }
    },
    [open, flatCount, flatHits, safeActiveIdx],
  );

  const isFullWidth = placement === 'drawer' || variant === 'full';
  const helpLinks = searchHelpLinks(domain);
  const emptyLinks = searchEmptyBrowseLinks(domain);
  const errorLinks = searchErrorBrowseLinks(domain);

  return (
    <div
      ref={containerRef}
      className={`gs-container gs-${placement} gs-${variant}`}
      role="search"
    >
      <form
        className="gs-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (flatCount > 0) {
            const target = flatHits[safeActiveIdx] ?? flatHits[0];
            if (target) window.location.href = target.href;
          }
        }}
        aria-label={searchLabel}
      >
        <label className="gs-label" htmlFor={inputId}>
          <span className="gs-label-text">Search</span>
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          role="combobox"
          className="gs-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={popupExpanded}
          aria-controls={showPopup ? (showResults ? listboxId : popupId) : undefined}
          aria-activedescendant={
            showResults && activeOptionDomId ? activeOptionDomId : undefined
          }
          aria-describedby={statusId}
        />
        {!isFullWidth && (
          <button type="submit" className="gs-submit" aria-label="Submit search">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </form>

      <div id={statusId} className="gs-status" aria-live="polite" aria-atomic="true">
        {statusText}
      </div>

      {showPopup && (
        <div id={popupId} className="gs-dropdown">
          {showHelp && (
            <div className="gs-help" role="region" aria-label="Search tips">
              <p className="gs-help-lead">
                Search dishes, countries, food families, lineages and ingredients.
              </p>
              <p className="gs-help-label">{isGeo ? 'Atlas browse' : 'Recipes browse'}</p>
              <ul className="gs-browse-list">
                {helpLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="gs-browse-link" onClick={() => setOpen(false)}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showLoading && (
            <div className="gs-empty gs-empty--loading" role="status">
              Searching…
            </div>
          )}

          {showError && (
            <div className="gs-empty gs-empty--error" role="alert">
              <p>Search is temporarily unavailable.</p>
              <ul className="gs-browse-list">
                {errorLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="gs-browse-link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showEmpty && (
            <div className="gs-empty" role="status">
              <p>
                Nothing matches &ldquo;{debounced}&rdquo;. Try{' '}
                <button type="button" className="gs-suggestion" onClick={() => setQuery('vindaloo')}>
                  vindaloo
                </button>
                ,{' '}
                <button
                  type="button"
                  className="gs-suggestion"
                  onClick={() => setQuery('filled dough')}
                >
                  filled dough
                </button>
                , or{' '}
                <button type="button" className="gs-suggestion" onClick={() => setQuery('Japan')}>
                  Japan
                </button>
                .
              </p>
              <p className="gs-help-label">Or browse</p>
              <ul className="gs-browse-list">
                {emptyLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="gs-browse-link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showResults && groups && (
            <>
              <div id={listboxId} className="gs-groups" role="listbox" aria-label="Search results">
                {GROUP_ORDER.map((t) => {
                  const g = groups.find((x) => x.type === t);
                  if (!g || g.results.length === 0) return null;
                  let flatStart = 0;
                  for (const prior of GROUP_ORDER) {
                    if (prior === t) break;
                    const pg = groups.find((x) => x.type === prior);
                    flatStart += pg?.results.length ?? 0;
                  }
                  return (
                    <div
                      key={t}
                      className="gs-group"
                      role="group"
                      aria-label={GROUP_LABELS[t]}
                    >
                      <div className="gs-group-label" aria-hidden="true">
                        {GROUP_LABELS[t]}
                      </div>
                      {g.results.map((hit, i) => {
                        const flatIdx = flatStart + i;
                        const isActive = flatIdx === safeActiveIdx;
                        const optId = searchOptionId(placement, t, hit.slug);
                        return (
                          <a
                            key={optId}
                            id={optId}
                            href={hit.href}
                            className={`gs-hit${isActive ? ' gs-hit--active' : ''}`}
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setActiveIdx(flatIdx)}
                            onClick={() => setOpen(false)}
                          >
                            <span className="gs-hit-name">{hit.name}</span>
                            {hit.shortDescription && (
                              <span className="gs-hit-desc">{hit.shortDescription}</span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {GROUP_ORDER.map((t) => {
                const g = groups.find((x) => x.type === t);
                if (!g || t !== 'dish' || g.total <= g.results.length) return null;
                return (
                  <a
                    key={`more-${t}`}
                    className="gs-more"
                    href={seeAllDishesHref(debounced, domain)}
                  >
                    See all {g.total} dish matches →
                  </a>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
