/**
 * The BUILD-TIME data for the recipe hubs.
 *
 * WHY THIS IS NOT THE CLIENT
 * --------------------------
 * The hub is a STATIC page. Its content is baked at build time, so the
 * data it needs has to be fetched at build time — and the whole point of
 * a static build is to fetch the shared data ONCE, not once per page.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * A hub is one page per dish, and there are 1,474 published dishes. If
 * each hub fetched its own data, the build would make 1,474 requests for
 * the recipes alone — on top of the 1,474 the Atlas dish pages already
 * make. The CI comments record that the web build already takes ~15
 * minutes at 1,474 dishes; adding 1,474 more fetches to it would make it
 * roughly twice as slow for no reason.
 *
 * So the hub's two inputs are fetched ONCE, here, and grouped:
 *
 *   1. THE DISH LIST — `GET /api/dishes?status=published`, paged.
 *      It carries every dish's slug, name, one-line description and
 *      cover image. That is exactly the hub's header ("name, photo,
 *      one-line definition"), so the hub needs no second request.
 *
 *   2. THE RECIPE FEED — `GET /api/recipes`, paged.
 *      It carries every published recipe, and each row names its dish.
 *      Grouping it by dish slug gives every hub its own list.
 *
 * The result is ~15 requests per feed instead of ~1,474 per feed.
 *
 * WHY THE GROUPING IS THE SAME ANSWER THE API GIVES
 * --------------------------------------------------
 * The API's hub endpoint (`GET /api/dishes/:slug/recipes`) returns
 * `total` and an `empty` flag, both derived from the count of published
 * recipes for that dish. The grouping here derives the same two facts
 * from the same rows — the feed IS the published set, read from the same
 * `recipe_published` view. So the count here and the count the API
 * would report cannot disagree.
 *
 * THE MEMO
 * --------
 * Both fetches are memoised on the module. Astro builds every page of a
 * route in one process, so the module-level promise is shared by all
 * 1,474 hub pages: the first page triggers the fetch and the rest await
 * the same promise.
 */

import type { RecipeSummary } from "./recipes";

/** The API's per-request page size (the API caps `limit` at 100). */
const PAGE_SIZE = 100;
/** A guard against a server that keeps returning the same page. */
const MAX_PAGES = 60;

/**
 * The dish summary the hub's header needs.
 *
 * Mirrors `DishSummary` in `types/dish.ts` for the fields the hub uses.
 */
export interface HubDishSummary {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  cover: {
    publicUrl: string | null;
    variantsUrls: Record<string, string>;
    width: number | null;
    height: number | null;
    altText: string | null;
  } | null;
}

/** The dish list, keyed by slug. */
export type DishSummaryMap = Map<string, HubDishSummary>;

/** The published recipes, keyed by the dish they belong to. */
export type RecipesByDish = Map<string, RecipeSummary[]>;

/**
 * Fetch a paged collection from the API.
 *
 * `extra` is appended to the query string, so the caller controls the
 * filters WITHOUT the risk of producing two `?` in one URL.
 */
async function fetchPaged<T>(
  apiBase: string,
  path: string,
  extra: Record<string, string>,
  pick: (json: unknown) => T[],
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const qs = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...extra,
    });
    const res = await fetch(`${apiBase}${path}?${qs.toString()}`);
    if (!res.ok) {
      throw new Error(`${path} returned ${res.status} at offset ${offset}`);
    }
    const json = (await res.json()) as unknown;
    const rows = pick(json);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

let dishSummaryPromise: Promise<DishSummaryMap> | null = null;
let recipesPromise: Promise<RecipesByDish> | null = null;

/**
 * Every published dish, with the fields the hub's header needs.
 *
 * Memoised: one fetch pass per BUILD, shared by every hub page.
 *
 * IT NEVER REJECTS. A failure resolves to an EMPTY map instead.
 *
 * WHY
 * ---
 * The hub's two inputs are INDEPENDENT: the dish header (name, photo,
 * one-line definition) and the recipes list. They are fetched
 * separately, and a failure in one must not erase the other.
 *
 * The first version of this module returned a REJECTING promise for
 * both, and the page awaited them with `Promise.all`. So when the
 * recipe feed was unavailable — which it is on every build that
 * predates the item-4 API, and on the CI mock, which has no
 * `/api/recipes` route — the whole `Promise.all` rejected, and the
 * dish header that had ALREADY been fetched successfully was thrown
 * away with it.
 *
 * The visible symptom was worse than a missing recipe list: every
 * hub rendered "Dish not found", a 404 for a dish that is published
 * and present. A page that fails loudly about the WRONG thing is
 * more misleading than one that quietly omits a section.
 *
 * So: the dish fetch resolves to an empty map on failure, and the
 * recipe fetch resolves to an empty grouping on failure. Each one
 * degrades on its own, and neither can take the other down.
 *
 * The failure is still LOGGED, so a broken build is visible in the
 * build log rather than only in the absence of a section.
 */
export function getHubDishSummaries(apiBase: string): Promise<DishSummaryMap> {
  if (dishSummaryPromise) return dishSummaryPromise;

  dishSummaryPromise = (async () => {
    const rows = await fetchPaged<HubDishSummary>(
      apiBase,
      "/api/dishes",
      { status: "published" },
      (json) => (json as { dishes?: HubDishSummary[] }).dishes ?? [],
    );
    const map: DishSummaryMap = new Map();
    for (const row of rows) map.set(row.slug, row);
    return map;
  })().catch((err) => {
    // A failed fetch must not poison the memo: a retry (a second build
    // in the same process) gets a fresh attempt.
    dishSummaryPromise = null;
    console.error(
      "[recipeHubData] the dish list fetch failed — the hubs will have no header:",
      err,
    );
    return new Map() as DishSummaryMap;
  });

  return dishSummaryPromise;
}

/**
 * Every published recipe, grouped by the dish it belongs to.
 *
 * Memoised: one fetch pass per BUILD, shared by every hub page.
 *
 * IT NEVER REJECTS — see `getHubDishSummaries` for why. A failure
 * resolves to an empty grouping, which is the same answer the API
 * gives for a dish with no published recipes.
 */
export function getHubRecipes(apiBase: string): Promise<RecipesByDish> {
  if (recipesPromise) return recipesPromise;

  recipesPromise = (async () => {
    const rows = await fetchPaged<RecipeSummary>(
      apiBase,
      "/api/recipes",
      {},
      (json) => (json as { recipes?: RecipeSummary[] }).recipes ?? [],
    );
    const map: RecipesByDish = new Map();
    for (const row of rows) {
      const list = map.get(row.dish.slug) ?? [];
      list.push(row);
      map.set(row.dish.slug, list);
    }
    return map;
  })().catch((err) => {
    recipesPromise = null;
    console.error(
      "[recipeHubData] the recipe feed fetch failed — the hubs will show their empty state:",
      err,
    );
    return new Map() as RecipesByDish;
  });

  return recipesPromise;
}
