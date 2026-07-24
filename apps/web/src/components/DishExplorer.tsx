import { useEffect, useId, useRef, useState } from 'react';
import { DishCard } from '@gustale/ui';
import { listDishes } from '../lib/api';
import {
  BROWSE_PAGE_SIZE,
  appendDishes,
  browseHasActiveFilters,
  browseStatusMessage,
  buildBrowseQuery,
  clearBrowseFilters,
  filterChipsFor,
  hasMorePages,
  mergeBrowseState,
  pageOffset,
  parseBrowseState,
  parseStructuredTokens,
  recoveryLinks,
  removeBrowseChip,
  type BrowseQueryState,
} from '../lib/browse';
import { currentDomain } from '../lib/domain';
import type { DishListResponse, DishSummary } from '../types/dish';

export interface DishExplorerProps {
  initial: DishListResponse;
}

function stateFromLocation(): BrowseQueryState {
  if (typeof window === 'undefined') return clearBrowseFilters();
  const parsed = parseBrowseState(new URLSearchParams(window.location.search));
  // Support legacy structured tokens baked into ?q=
  if (parsed.q && /:\S/.test(parsed.q)) {
    const tokens = parseStructuredTokens(parsed.q);
    return mergeBrowseState({ ...parsed, q: tokens.q ?? '' }, tokens);
  }
  return parsed;
}

function toListParams(state: BrowseQueryState, offset: number) {
  return {
    status: 'published' as const,
    search: state.q || undefined,
    country: state.country ?? undefined,
    cuisine: state.cuisine ?? undefined,
    type: state.type ?? undefined,
    ingredient: state.ingredient ?? undefined,
    technique: state.technique ?? undefined,
    family: state.family ?? undefined,
    limit: BROWSE_PAGE_SIZE,
    offset,
  };
}

export function DishExplorer({ initial }: DishExplorerProps) {
  const domain = currentDomain();
  const reactId = useId().replace(/:/g, '');
  const searchId = `dish-browse-search-${reactId}`;
  const statusId = `dish-browse-status-${reactId}`;

  const [state, setState] = useState<BrowseQueryState>(() => stateFromLocation());
  const [dishes, setDishes] = useState<DishSummary[]>(initial.dishes);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(
    hasMorePages(initial.dishes.length, BROWSE_PAGE_SIZE),
  );
  const [inputValue, setInputValue] = useState(state.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextFetch = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const chips = filterChipsFor(state);
  const hasFilters = browseHasActiveFilters(state);
  const recovery = recoveryLinks(domain);

  // Sync URL when state changes (shareable + Back/Forward).
  useEffect(() => {
    const qs = buildBrowseQuery(state);
    const next = `${window.location.pathname}${qs}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) {
      window.history.pushState({ browse: state }, '', next);
    }
  }, [state]);

  useEffect(() => {
    const onPop = () => setState(stateFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Debounce free-text into state.q
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = inputValue.trim();
      const tokens = /:\S/.test(trimmed) ? parseStructuredTokens(trimmed) : null;
      setState((prev) => {
        if (tokens) {
          return mergeBrowseState(prev, { ...tokens, page: 1 });
        }
        if (prev.q === trimmed) return prev;
        return { ...prev, q: trimmed, page: 1 };
      });
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Fetch when filters/page change. Keep cards during requests.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      // If URL asks for page > 1 on first paint, load remaining pages.
      if (state.page > 1) {
        void loadThroughPage(state);
      }
      return;
    }
    void replaceResults(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.q, state.family, state.country, state.cuisine, state.type, state.ingredient, state.technique]);

  async function replaceResults(next: BrowseQueryState) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setFailed(false);
    try {
      const res = await listDishes(toListParams({ ...next, page: 1 }, 0));
      if (ac.signal.aborted) return;
      setDishes(res.dishes);
      setHasMore(hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE));
      setState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
    } catch {
      if (ac.signal.aborted) return;
      setFailed(true);
      // Keep existing SSR/client cards visible.
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  async function loadThroughPage(next: BrowseQueryState) {
    setLoadingMore(true);
    setFailed(false);
    try {
      let merged = dishes.slice();
      let page = 1;
      let more = hasMorePages(merged.length, BROWSE_PAGE_SIZE);
      while (page < next.page && more) {
        const offset = pageOffset(page + 1, BROWSE_PAGE_SIZE);
        const res = await listDishes(toListParams(next, offset));
        merged = appendDishes(merged, res.dishes);
        more = hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE);
        page += 1;
      }
      setDishes(merged);
      setHasMore(more);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setFailed(false);
    const nextPage = state.page + 1;
    const offset = pageOffset(nextPage, BROWSE_PAGE_SIZE);
    try {
      const res = await listDishes(toListParams(state, offset));
      setDishes((prev) => appendDishes(prev, res.dishes));
      setHasMore(hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE));
      setState((s) => ({ ...s, page: nextPage }));
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function clearAll() {
    setInputValue('');
    setState(clearBrowseFilters());
    skipNextFetch.current = false;
    void replaceResults(clearBrowseFilters());
  }

  async function retry() {
    await replaceResults(state);
  }

  const status = browseStatusMessage({
    loading: loading || loadingMore,
    failed,
    count: dishes.length,
    query: state.q || chips.map((c) => c.value).join(', '),
    noun: 'dishes',
  });

  return (
    <div className="browse-shell">
      <div className="browse-toolbar-island">
        <label className="browse-search-sr" htmlFor={searchId}>
          Search dishes
        </label>
        <div className="browse-search browse-search--island">
          <input
            id={searchId}
            type="search"
            className="browse-search-field"
            placeholder="Search dishes by name, country, or family…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={statusId}
          />
        </div>
        <p className="browse-count" id={statusId} aria-live="polite" aria-atomic="true">
          {status}
        </p>
        {hasFilters && (
          <button type="button" className="browse-clear" onClick={clearAll}>
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
                onClick={() => {
                  const next = removeBrowseChip(state, chip.stateKey);
                  if (chip.stateKey === 'q') setInputValue('');
                  setState(next);
                }}
              >
                {chip.label}
                <span aria-hidden="true"> ×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {failed && (
        <div className="browse-banner browse-banner--error" role="alert">
          <p>Browse data is temporarily unavailable. Existing results stay visible.</p>
          <div className="browse-banner-actions">
            <button type="button" className="btn-outline" onClick={() => void retry()}>
              Retry
            </button>
            {recovery.altBrowse && (
              <a className="browse-alt-link" href={recovery.altBrowse.href}>
                {recovery.altBrowse.label}
              </a>
            )}
          </div>
          <ul className="browse-recovery">
            {recovery.primary.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dishes.length === 0 && !loading && !failed && (
        <div className="browse-banner" role="status">
          <p>
            No dishes match
            {state.q ? (
              <>
                {' '}
                “{state.q}”
              </>
            ) : (
              ' these filters'
            )}
            .
          </p>
          <button type="button" className="btn-outline" onClick={clearAll}>
            Clear search
          </button>
          <ul className="browse-recovery">
            {recovery.primary.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
            {recovery.altBrowse && (
              <li>
                <a href={recovery.altBrowse.href}>{recovery.altBrowse.label}</a>
              </li>
            )}
          </ul>
        </div>
      )}

      {dishes.length > 0 && (
        <ul className="browse-grid">
          {dishes.map((d) => (
            <li key={d.id}>
              <DishCard
                title={d.canonicalName}
                slug={d.slug}
                description={
                  [d.originName, d.familyName, d.shortDescription]
                    .filter(Boolean)
                    .join(' · ') || d.shortDescription
                }
                href={`/dishes/${d.slug}`}
                status={d.status}
                viewCount={d.viewCount}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && dishes.length > 0 && (
        <div className="browse-more">
          <button
            type="button"
            className="btn-accent"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more dishes'}
          </button>
        </div>
      )}

      {loading && dishes.length > 0 && (
        <p className="browse-inline-status" aria-live="polite">
          Updating results…
        </p>
      )}
    </div>
  );
}
