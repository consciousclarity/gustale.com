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
  serializeBrowseState,
  sliceDishesToPage,
} from "../lib/browse";
import { currentDomain } from "../lib/domain";
import type { PathPageSlugs } from "../lib/filterPages";
import { slugify } from "../lib/slug";
import type { DishListResponse, DishSummary } from "../types/dish";

/** Filters a static path page has already applied in its server HTML. */
export type FixedFilters = Partial<
  Pick<BrowseQueryState, "country" | "category" | "technique">
>;

export interface DishExplorerProps {
  initial: DishListResponse;
  /**
   * Set on `/dishes/<kind>/<slug>/` pages: the filter the server HTML
   * already applied. It is not written to the URL query and its chip
   * removes it by returning to /dishes.
   */
  fixed?: FixedFilters;
  /** Which filtered lists have a static path page (for the redirect). */
  pathPages?: PathPageSlugs | null;
}

type PendingOp =
  | { kind: "replace"; state: BrowseQueryState }
  | { kind: "extend"; state: BrowseQueryState; toPage: number }
  | { kind: "loadMore"; state: BrowseQueryState; nextPage: number };

function stateFromLocation(fixed: FixedFilters = {}): BrowseQueryState {
  if (typeof window === "undefined") {
    return mergeBrowseState(clearBrowseFilters(), fixed);
  }
  const parsed = parseBrowseState(new URLSearchParams(window.location.search));
  const base =
    parsed.q && /:\S/.test(parsed.q)
      ? (() => {
          const tokens = parseStructuredTokens(parsed.q);
          return mergeBrowseState({ ...parsed, q: tokens.q ?? "" }, tokens);
        })()
      : parsed;
  return mergeBrowseState(base, fixed);
}

/** The URL query for a state, without the filters the path already carries. */
function queryFor(state: BrowseQueryState, fixed: FixedFilters): string {
  const sp = serializeBrowseState(state);
  for (const k of Object.keys(fixed)) sp.delete(k);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** `/dishes?country=X` -> `/dishes/region/x/` when that page exists. */
function pathFormFor(
  state: BrowseQueryState,
  pages: PathPageSlugs | null | undefined,
): string | null {
  if (!pages) return null;
  const filters = (["country", "category", "technique"] as const).filter(
    (k) => state[k],
  );
  if (filters.length !== 1) return null;
  const onlyThat =
    !state.q &&
    !state.family &&
    !state.cuisine &&
    !state.type &&
    !state.ingredient &&
    !state.sort &&
    state.page === 1;
  if (!onlyThat) return null;
  const k = filters[0] as "country" | "category" | "technique";
  const v = state[k] as string;
  if (k === "country") {
    const s = slugify(v);
    return pages.region.includes(s) ? `/dishes/region/${s}/` : null;
  }
  return pages[k].includes(v) ? `/dishes/${k}/${v}/` : null;
}

function toListParams(state: BrowseQueryState, offset: number) {
  return {
    status: "published" as const,
    search: state.q || undefined,
    country: state.country ?? undefined,
    cuisine: state.cuisine ?? undefined,
    category: state.category ?? undefined,
    type: state.type ?? undefined,
    ingredient: state.ingredient ?? undefined,
    technique: state.technique ?? undefined,
    family: state.family ?? undefined,
    limit: BROWSE_PAGE_SIZE,
    offset,
  };
}

export function DishExplorer({
  initial,
  fixed = {},
  pathPages = null,
}: DishExplorerProps) {
  const domain = currentDomain();
  const reactId = useId().replace(/:/g, "");
  const searchId = `dish-browse-search-${reactId}`;
  const statusId = `dish-browse-status-${reactId}`;

  const [state, setState] = useState<BrowseQueryState>(() =>
    stateFromLocation(fixed),
  );
  const [dishes, setDishes] = useState<DishSummary[]>(initial.dishes);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // The API reports `hasMore` against the REAL total, so it is
  // authoritative. The short-page heuristic is the fallback for an
  // API that does not report one.
  const [hasMore, setHasMore] = useState(
    initial.hasMore ?? hasMorePages(initial.dishes.length, BROWSE_PAGE_SIZE),
  );
  // The number of dishes matching the filters -- NOT the number
  // loaded so far. `null` until the API reports one.
  const [total, setTotal] = useState<number | null>(initial.total);
  const [inputValue, setInputValue] = useState(state.q);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFilterFetch = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const dishesRef = useRef<DishSummary[]>(initial.dishes);
  const loadedPageRef = useRef(1);
  const filtersKeyRef = useRef(browseFiltersKey(state));
  // What the server HTML already shows: no filter on /dishes, the fixed
  // filter on a path page. A first-load state that differs from this must
  // be fetched -- the static HTML is not the answer to it.
  const baseKeyRef = useRef(
    browseFiltersKey(mergeBrowseState(clearBrowseFilters(), fixed)),
  );
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
    const qs = queryFor(state, fixed);
    const next = `${window.location.pathname}${qs}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) {
      window.history.pushState({ browse: state }, "", next);
    }
  }, [state]);

  useEffect(() => {
    const onPop = () => {
      const next = stateFromLocation(fixed);
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
      // A single filter that has a static page: go there. (A no-JS visitor
      // never gets here -- the links already point at the path form.)
      const path = Object.keys(fixed).length
        ? null
        : pathFormFor(state, pathPages);
      if (path) {
        window.location.replace(path);
        return;
      }
      // The URL carried a filter the server HTML does not reflect (a
      // direct load of /dishes?country=X). The static list is NOT the
      // answer, so fetch it. Skipping this made every filter inert on a
      // direct load.
      if (key !== baseKeyRef.current) {
        loadedPageRef.current = 1;
        // (A shared ?page=N on a FILTERED direct load restarts at page 1.)
        void replaceResults({ ...state });
        return;
      }
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
    state.category,
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
      setTotal(res.total ?? null);
      setHasMore(
        res.hasMore ?? hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE),
      );
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
        setTotal(res.total ?? null);
        setHasMore(
          res.hasMore ?? hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE),
        );
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
        const more =
          res.hasMore ?? hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE);
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
      const more =
        res.hasMore ?? hasMorePages(res.dishes.length, BROWSE_PAGE_SIZE);
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
    if (Object.keys(fixed).length) {
      // A path page's own filter is part of the page: clearing returns to
      // the full list.
      window.location.assign("/dishes");
      return;
    }
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
    // The total matching the filters. Without it the count would say
    // "24 dishes" for a catalogue of 1,474 -- a number that reads as
    // the whole and is not.
    total,
    query: state.q || chips.map((c) => c.value).join(", "),
    noun: "dish",
    nounPlural: "dishes",
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

      {chips.length > 0 && Object.keys(fixed).length === 0 && (
        <h2 className="browse-active-heading" aria-live="polite">
          {typeof total === "number"
            ? `${total.toLocaleString("en-US")} ${total === 1 ? "dish" : "dishes"}`
            : "Dishes"}
          {state.country ? ` from ${state.country}` : ""}
          {chips
            .filter((c) => c.stateKey !== "country" && c.stateKey !== "q")
            .map((c) => ` · ${c.label}`)
            .join("")}
        </h2>
      )}

      {chips.length > 0 && (
        <ul className="browse-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              {chip.stateKey in fixed ? (
                // The path page's own filter: removing it is a navigation
                // to the full list, and it is a plain link (works with no JS).
                <a
                  className="browse-chip"
                  href="/dishes"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label}
                  <span aria-hidden="true"> ×</span>
                </a>
              ) : (
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
              )}
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
                cover={d.cover ?? null}
                headingLevel="h2"
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
