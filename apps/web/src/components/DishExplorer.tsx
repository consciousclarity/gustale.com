import { DishCard } from "@gustale/ui";
import { useEffect, useId, useRef, useState } from "react";
import { listDishes } from "../lib/api";
import {
  appendDishes,
  BROWSE_PAGE_SIZE,
  type BrowseQueryState,
  browseFiltersKey,
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
  planHistoryRestore,
  recoveryLinks,
  removeBrowseChip,
  sliceDishesToPage,
} from "../lib/browse";
import { currentDomain } from "../lib/domain";
import type { DishListResponse, DishSummary } from "../types/dish";

export interface DishExplorerProps {
  initial: DishListResponse;
}

type PendingOp =
  | { kind: "replace"; state: BrowseQueryState }
  | { kind: "extend"; state: BrowseQueryState; toPage: number }
  | { kind: "loadMore"; state: BrowseQueryState; nextPage: number };

function stateFromLocation(): BrowseQueryState {
  if (typeof window === "undefined") return clearBrowseFilters();
  const parsed = parseBrowseState(new URLSearchParams(window.location.search));
  if (parsed.q && /:\S/.test(parsed.q)) {
    const tokens = parseStructuredTokens(parsed.q);
    return mergeBrowseState({ ...parsed, q: tokens.q ?? "" }, tokens);
  }
  return parsed;
}

function toListParams(state: BrowseQueryState, offset: number) {
  return {
    status: "published" as const,
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
  const reactId = useId().replace(/:/g, "");
  const searchId = `dish-browse-search-${reactId}`;
  const statusId = `dish-browse-status-${reactId}`;

  const [state, setState] = useState<BrowseQueryState>(() =>
    stateFromLocation(),
  );
  const [dishes, setDishes] = useState<DishSummary[]>(initial.dishes);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(
    hasMorePages(initial.dishes.length, BROWSE_PAGE_SIZE),
  );
  const [inputValue, setInputValue] = useState(state.q);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFilterFetch = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const dishesRef = useRef<DishSummary[]>(initial.dishes);
  const loadedPageRef = useRef(1);
  const filtersKeyRef = useRef(browseFiltersKey(state));
  const pendingOpRef = useRef<PendingOp | null>(null);
  /** When true, the next state.page change came from Load more — skip restore. */
  const loadMoreBumpRef = useRef(false);

  const chips = filterChipsFor(state);
  const hasFilters = browseHasActiveFilters(state);
  const recovery = recoveryLinks(domain);

  function commitDishes(next: DishSummary[]) {
    dishesRef.current = next;
    setDishes(next);
  }

  function beginGeneration(): { ac: AbortController; gen: number } {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    genRef.current += 1;
    return { ac, gen: genRef.current };
  }

  function isCurrent(gen: number, ac: AbortController): boolean {
    return (
      genRef.current === gen && !ac.signal.aborted && abortRef.current === ac
    );
  }

  // Sync URL when state changes (shareable + Back/Forward).
  useEffect(() => {
    const qs = buildBrowseQuery(state);
    const next = `${window.location.pathname}${qs}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) {
      window.history.pushState({ browse: state }, "", next);
    }
  }, [state]);

  useEffect(() => {
    const onPop = () => {
      const next = stateFromLocation();
      setInputValue(next.q);
      loadMoreBumpRef.current = false;
      setState(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Debounce free-text into state.q (resets page to 1).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = inputValue.trim();
      const tokens = /:\S/.test(trimmed)
        ? parseStructuredTokens(trimmed)
        : null;
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

  // Filter changes → full replace at page 1. Does NOT depend on state.page alone.
  useEffect(() => {
    const key = browseFiltersKey(state);
    if (skipFilterFetch.current) {
      skipFilterFetch.current = false;
      filtersKeyRef.current = key;
      // Shared ?page=N on first paint: reconstruct pages 1…N.
      if (state.page > 1) {
        void extendToPage(state, state.page);
      } else {
        loadedPageRef.current = 1;
      }
      return;
    }
    if (key === filtersKeyRef.current) return;
    filtersKeyRef.current = key;
    loadMoreBumpRef.current = false;
    void replaceResults({ ...state, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.q,
    state.family,
    state.country,
    state.cuisine,
    state.type,
    state.ingredient,
    state.technique,
  ]);

  // History restoration for page changes (Back/Forward / shared URL).
  // Load more bumps loadedPageRef before setState so plan → noop.
  useEffect(() => {
    if (loadMoreBumpRef.current) {
      loadMoreBumpRef.current = false;
      return;
    }
    // Filter effect owns filter transitions.
    if (browseFiltersKey(state) !== filtersKeyRef.current) return;

    const plan = planHistoryRestore(state.page, loadedPageRef.current);
    if (plan.action === "noop") return;
    if (plan.action === "trim") {
      commitDishes(
        sliceDishesToPage(dishesRef.current, plan.page, BROWSE_PAGE_SIZE),
      );
      loadedPageRef.current = plan.page;
      setHasMore(true);
      setFailed(false);
      return;
    }
    void extendToPage(state, plan.toPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.page]);

  async function replaceResults(next: BrowseQueryState) {
    pendingOpRef.current = { kind: "replace", state: next };
    const { ac, gen } = beginGeneration();
    setLoading(true);
    setFailed(false);
    try {
      const res = await listDishes(toListParams({ ...next, page: 1 }, 0));
      if (!isCurrent(gen, ac)) return;
      commitDishes(res.dishes);
      loadedPageRef.current = 1;
      setHasMore(hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE));
      setState((s) => {
        const merged = { ...s, ...next, page: 1 };
        filtersKeyRef.current = browseFiltersKey(merged);
        return s.page === 1 && browseFiltersKey(s) === browseFiltersKey(merged)
          ? s
          : merged;
      });
      pendingOpRef.current = null;
    } catch {
      if (!isCurrent(gen, ac)) return;
      setFailed(true);
      // Keep existing cards.
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }

  async function extendToPage(next: BrowseQueryState, toPage: number) {
    pendingOpRef.current = { kind: "extend", state: next, toPage };
    const { ac, gen } = beginGeneration();
    setLoadingMore(true);
    setFailed(false);
    try {
      let merged = dishesRef.current.slice();
      let page = loadedPageRef.current;

      if (page < 1 && merged.length > 0) {
        page = 1;
        loadedPageRef.current = 1;
      }

      if (page < 1) {
        const res = await listDishes(toListParams(next, 0));
        if (!isCurrent(gen, ac)) return;
        merged = res.dishes.slice();
        page = 1;
        loadedPageRef.current = 1;
        commitDishes(merged);
        setHasMore(hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE));
      }

      while (page < toPage) {
        const offset = pageOffset(page + 1, BROWSE_PAGE_SIZE);
        const res = await listDishes(toListParams(next, offset));
        if (!isCurrent(gen, ac)) return;
        if (res.dishes.length === 0) {
          setHasMore(false);
          break;
        }
        merged = appendDishes(merged, res.dishes);
        const more = hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE);
        page += 1;
        loadedPageRef.current = page;
        commitDishes(merged);
        setHasMore(more);
        if (!more) break;
      }
      pendingOpRef.current = null;
    } catch {
      if (!isCurrent(gen, ac)) return;
      setFailed(true);
      // Retain currently useful cards; Retry continues extend/loadMore.
    } finally {
      if (abortRef.current === ac) setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (loadingMore || loading || !hasMore) return;
    const nextPage = loadedPageRef.current + 1;
    pendingOpRef.current = { kind: "loadMore", state, nextPage };
    const { ac, gen } = beginGeneration();
    setLoadingMore(true);
    setFailed(false);
    const offset = pageOffset(nextPage, BROWSE_PAGE_SIZE);
    try {
      const res = await listDishes(toListParams(state, offset));
      if (!isCurrent(gen, ac)) return;
      const merged = appendDishes(dishesRef.current, res.dishes);
      commitDishes(merged);
      const more = hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE);
      setHasMore(more);
      // Update loaded page BEFORE state.page so history effect noops.
      loadedPageRef.current = nextPage;
      loadMoreBumpRef.current = true;
      setState((s) => ({ ...s, page: nextPage }));
      pendingOpRef.current = null;
    } catch {
      if (!isCurrent(gen, ac)) return;
      setFailed(true);
    } finally {
      if (abortRef.current === ac) setLoadingMore(false);
    }
  }

  function clearAll() {
    setInputValue("");
    const cleared = clearBrowseFilters();
    filtersKeyRef.current = browseFiltersKey(cleared);
    loadMoreBumpRef.current = false;
    setState(cleared);
    void replaceResults(cleared);
  }

  async function retry() {
    const pending = pendingOpRef.current;
    if (pending?.kind === "loadMore") {
      await loadMore();
      return;
    }
    if (pending?.kind === "extend") {
      await extendToPage(pending.state, pending.toPage);
      return;
    }
    await replaceResults(pending?.kind === "replace" ? pending.state : state);
  }

  const status = browseStatusMessage({
    loading: loading || loadingMore,
    failed,
    count: dishes.length,
    query: state.q || chips.map((c) => c.value).join(", "),
    noun: "dishes",
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
        <p
          className="browse-count"
          id={statusId}
          aria-live="polite"
          aria-atomic="true"
        >
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
                  if (chip.stateKey === "q") setInputValue("");
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
          <p>
            Browse data is temporarily unavailable. Existing results stay
            visible.
          </p>
          <div className="browse-banner-actions">
            <button
              type="button"
              className="btn-outline"
              onClick={() => void retry()}
            >
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
            {state.q ? <> “{state.q}”</> : " these filters"}.
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
                  [d.originName, d.familyName].filter(Boolean).join(" · ") ||
                  d.shortDescription ||
                  undefined
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
            {loadingMore ? "Loading…" : "Load more dishes"}
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
