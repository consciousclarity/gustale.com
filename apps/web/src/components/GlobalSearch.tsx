import { useCallback, useEffect, useRef, useState } from 'react';
import { globalSearch, type SearchGroup, type SearchGroupType } from '../lib/api';

// ─── Constants ──────────────────────────────────────────────────────────
const DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;
const GROUP_LABELS: Record<SearchGroupType, string> = {
  dish: 'Dishes',
  lineage: 'Lineages',
  ingredient: 'Ingredients',
  region: 'Regions',
};
// Order in which groups appear in the dropdown — dishes first (most
// frequent queries are by dish name), then lineages, ingredients, regions.
const GROUP_ORDER: SearchGroupType[] = ['dish', 'lineage', 'ingredient', 'region'];

interface GlobalSearchProps {
  /** "compact" = header pill (desktop); "full" = expanded always (mobile drawer). */
  variant?: 'compact' | 'full';
  /** On mobile, the input fills the viewport; on desktop it sits in the
   *  nav header and the dropdown anchors below it. */
  placement?: 'header' | 'drawer';
}

// ─── Component ──────────────────────────────────────────────────────────
export function GlobalSearch({ variant = 'compact', placement = 'header' }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0); // flat index across all groups for keyboard nav

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  // Debounce query → debounced.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Fire the search whenever debounced changes.
  useEffect(() => {
    if (debounced.length < MIN_QUERY_LENGTH) {
      setGroups(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Cancel any in-flight request. Without this, a fast typist can race
    // stale responses: keystroke "vin" → fetch starts; keystroke "da"
    // → another fetch starts; out-of-order resolutions put the user on
    // a wrong group-set. The newer promise wins; the older is aborted.
    if (aborterRef.current) aborterRef.current.abort();
    const ac = new AbortController();
    aborterRef.current = ac;

    globalSearch({ q: debounced, limit: 5 })
      .then((res) => {
        if (ac.signal.aborted) return;
        setGroups(res.groups);
        setActiveIdx(0);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'search failed';
        setError(msg);
        setGroups(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [debounced]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Escape closes; arrow keys navigate; Enter activates.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    const totalHits = groups?.reduce((sum, g) => sum + g.results.length, 0) ?? 0;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown' && totalHits > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % totalHits);
      return;
    }
    if (e.key === 'ArrowUp' && totalHits > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + totalHits) % totalHits);
      return;
    }
    if (e.key === 'Enter' && totalHits > 0) {
      e.preventDefault();
      const flat = groups!.flatMap((g) => g.results);
      const target = flat[activeIdx] ?? flat[0];
      if (target) window.location.href = target.href;
    }
  }, [open, groups, activeIdx]);

  // When the result list changes, recompute the active index bounds.
  const flatCount = groups?.reduce((sum, g) => sum + g.results.length, 0) ?? 0;
  if (activeIdx >= flatCount && flatCount > 0) {
    // It's a render-time side-effect; React will re-render with idx=0.
    setActiveIdx(0);
  }

  const showDropdown = open && debounced.length >= MIN_QUERY_LENGTH;
  const isFullWidth = placement === 'drawer' || variant === 'full';

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
            const flat = groups!.flatMap((g) => g.results);
            window.location.href = (flat[activeIdx] ?? flat[0]).href;
          }
        }}
        role="search"
        aria-label="Search the Gustale atlas"
      >
        <input
          ref={inputRef}
          type="search"
          className="gs-input"
          placeholder={isFullWidth ? 'Search dishes, regions, lineages, ingredients…' : 'Search'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-controls={showDropdown ? 'gs-results' : undefined}
          aria-expanded={showDropdown}
        />
        {!isFullWidth && (
          <button type="submit" className="gs-submit" aria-label="Search">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </form>

      {showDropdown && (
        <div
          id="gs-results"
          className="gs-dropdown"
          role="listbox"
          aria-label="Search results"
        >
          {loading && <div className="gs-empty">Searching…</div>}
          {error && !loading && (
            <div className="gs-empty gs-empty--error">
              Search unavailable. Try browsing <a href="/dishes">dishes</a>,{' '}
              <a href="/lineages">lineages</a>, or <a href="/regions">regions</a>.
            </div>
          )}
          {!loading && !error && groups && flatCount === 0 && (
            <div className="gs-empty">
              Nothing matches &ldquo;{debounced}&rdquo;. Try{' '}
              <button type="button" className="gs-suggestion" onClick={() => setQuery('vindaloo')}>vindaloo</button>,{' '}
              <button type="button" className="gs-suggestion" onClick={() => setQuery('filled dough')}>filled dough</button>, or{' '}
              <button type="button" className="gs-suggestion" onClick={() => setQuery('Japan')}>Japan</button>.
            </div>
          )}
          {!loading && !error && groups && flatCount > 0 && (
            <div className="gs-groups">
              {GROUP_ORDER.map((t) => {
                const g = groups.find((x) => x.type === t);
                if (!g || g.results.length === 0) return null;
                // Compute the global flat-index of this group's first hit so
                // arrow-key navigation has a single linear index for the whole
                // dropdown.
                let flatStart = 0;
                for (const prior of GROUP_ORDER) {
                  if (prior === t) break;
                  const pg = groups.find((x) => x.type === prior);
                  flatStart += pg?.results.length ?? 0;
                }
                return (
                  <section key={t} className="gs-group">
                    <h3 className="gs-group-label">{GROUP_LABELS[t]}</h3>
                    <ul className="gs-list">
                      {g.results.map((hit, i) => {
                        const flatIdx = flatStart + i;
                        const isActive = flatIdx === activeIdx;
                        return (
                          <li key={hit.slug}>
                            <a
                              href={hit.href}
                              className={`gs-hit${isActive ? ' gs-hit--active' : ''}`}
                              role="option"
                              aria-selected={isActive}
                              data-flat-idx={flatIdx}
                              onMouseEnter={() => setActiveIdx(flatIdx)}
                              onClick={() => setOpen(false)}
                            >
                              <span className="gs-hit-name">{hit.name}</span>
                              {hit.shortDescription && (
                                <span className="gs-hit-desc">{hit.shortDescription}</span>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                    {g.total > g.results.length && (
                      <a
                        className="gs-more"
                        href={`/dishes?q=${encodeURIComponent(debounced)}${t === 'dish' ? '' : `&type=${t}`}`}
                      >
                        See all {g.total} {GROUP_LABELS[t].toLowerCase()} matches →
                      </a>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
