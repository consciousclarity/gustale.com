/**
 * The RECIPE API client — item 5.
 *
 * WHAT THIS IS
 * ------------
 * The front-end's typed access to the item-4 recipe routes:
 *
 *   GET /api/recipes               the FEED: every published recipe
 *   GET /api/dishes/:slug/recipes  the HUB: one dish's published recipes
 *   GET /api/recipes/:slug         ONE recipe: sentences, ingredients, confidence
 *   GET /api/recipes/settings      the kill switch (mode, enabled, dailyCap)
 *
 * WHY A SEPARATE FILE AND NOT ANOTHER EXPORT IN `lib/api.ts`
 * -----------------------------------------------------------
 * `lib/api.ts` is the ATLAS client, and it is 1,358 lines of Atlas-shaped
 * reads. The recipe routes have their own vocabulary — a recipe is not a
 * dish, a sentence is not a description — and they have their own rules
 * about what a response can contain. Mixing them would blur exactly the
 * line ADR-007-A1 draws: the Atlas records what a dish IS, the recipes
 * property records how it is MADE.
 *
 * THE SHAPES ARE COPIED FROM THE API, NOT GUESSED
 * ------------------------------------------------
 * Every interface below mirrors a shape in
 * `apps/api/src/routes/recipes.ts` (item 4) field for field. When the
 * API changes, this file changes with it — the two are a pair.
 *
 * THE PUBLISH GATE, AS THE CLIENT SEES IT
 * --------------------------------------
 * The API reads the `recipe_published` VIEW, not the `recipes` table.
 * So a draft recipe is a 404 — the same 404 as a slug that does not
 * exist. The client does not distinguish them, and neither should the
 * page: a page that said "this recipe exists but is not published yet"
 * would leak the existence of a draft.
 *
 * `null` confidence is NOT "low". A null means the recipe has never been
 * through the publish path, so nothing was computed. The API is explicit
 * about this and so is this client: `confidence` is null-able, and the
 * page renders "not yet computed" — never a made-up level.
 */

import { ApiError } from "./api";

// ─── The shapes the API returns ───────────────────────────────────────────

/**
 * A recipe's content type.
 *
 * `variation` is the important one: ADR-007 requires each variation to be
 * its OWN recipe (`nasi-goreng-kampung` and `nasi-goreng-jawa` are two
 * recipes, not one recipe with two names), so a hub can hold several.
 */
export type RecipeContentType =
  | "recipe"
  | "variation"
  | "technique"
  | "base"
  | "template";

/** The confidence level the DATABASE computed. Never set by the API. */
export type RecipeConfidenceLevel = "high" | "medium" | "low";

/**
 * A recipe in a list — the feed, or a dish's hub.
 *
 * This is the API's `shapeRecipe()` output, unchanged.
 */
export interface RecipeSummary {
  id: string;
  slug: string;
  title: string;
  /** The dish it belongs to, so a card can link to the hub. */
  dish: {
    slug: string;
    name: string;
  };
  contentType: RecipeContentType;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /**
   * The COMPUTED confidence.
   *
   * `null` means "not computed" — the recipe has never been through the
   * publish path. It is NOT "low": "low" is a computed level that says
   * something about the evidence, and null says something different.
   */
  confidence: RecipeConfidenceLevel | null;
  publishedAt: string | null;
}

/** The list envelope — the same `total`/`hasMore` contract as the dish list. */
export interface RecipeListResponse {
  recipes: RecipeSummary[];
  limit: number;
  offset: number;
  /** The number that MATCH the filters, not the number in this page. */
  total: number;
  /** Computed from `total`, so it cannot disagree with it. */
  hasMore: boolean;
}

/**
 * The HUB's response — the recipes of ONE dish, plus the dish's own header
 * so the page does not need a second request for it.
 */
export interface RecipeHubResponse {
  dish: {
    slug: string;
    name: string;
    shortDescription: string | null;
  };
  recipes: RecipeSummary[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  /**
   * The hub's empty state, DERIVED from the count (ADR-007-A1 §5.2).
   *
   * It is the TOTAL, not the page's length: a dish with 30 recipes is not
   * empty, even on a page that returned none. The page's `noindex` and its
   * "No recipe yet" heading both read this flag, so the two cannot drift.
   */
  empty: boolean;
}

/** One sentence of a recipe, in one locale. */
export interface RecipeSentence {
  id: string;
  /** Which part of the recipe the sentence belongs to. */
  field: "step" | "note" | "intro";
  locale: string;
  position: number;
  text: string;
  /**
   * Whether this row is the original, or a translation of it.
   *
   * ADR-007-A1 §4.3: the original-language sentence is the one with
   * `is_original = true`; a translation points at its source.
   */
  isOriginal: boolean;
}

/** One ingredient of a recipe, with the shared Atlas ingredient's name. */
export interface RecipeIngredient {
  id: string;
  ingredient: {
    slug: string;
    name: string;
  };
  quantity: string | null;
  unit: string | null;
  isOptional: boolean;
  preparationNote: string | null;
  position: number;
}

/**
 * The confidence, in full.
 *
 * `conditionsMet` holds every FAILING condition, so the page can say WHICH
 * condition failed rather than only that it did not reach HIGH.
 */
export interface RecipeConfidence {
  level: RecipeConfidenceLevel;
  /** Every failing condition. `{}` when every condition is met. */
  conditionsMet: Record<string, unknown>;
  independentSources: unknown;
  sourceCount: number;
  ingredientCount: number;
  sentenceCount: number;
  computedAt: string | null;
  /** A reviewer's manual override, when there is one. */
  overrideLevel: RecipeConfidenceLevel | null;
}

/** ONE recipe, with its sentences, its ingredients and its confidence. */
export interface RecipeDetailResponse {
  recipe: RecipeSummary & {
    sentences: RecipeSentence[];
    ingredients: RecipeIngredient[];
  };
  /** `null` when it has never been computed — NOT "low". */
  confidence: RecipeConfidence | null;
}

/** The kill switch, read-only. */
export interface RecipeSettingsResponse {
  autoPublish: {
    mode: "enabled" | "disabled" | "enabled_with_cap";
    enabled: boolean;
    dailyCap: number;
  };
}

// ─── The request helper ───────────────────────────────────────────────────

// Build-time API host — used only during SSR. In the browser we always
// use the relative /api path, so same-origin proxying handles the routing
// (the same rule `lib/api.ts` follows).
const SSR_API_BASE = import.meta.env.PUBLIC_API_BASE ?? "http://localhost:4000";
const API_BASE = import.meta.env.SSR ? SSR_API_BASE : "";

/**
 * A GET that throws `ApiError` on a non-2xx.
 *
 * The recipe routes return a JSON error body (`{ error, message, code }`),
 * so the body is parsed when it can be and kept raw otherwise.
 */
async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "GET" });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, body, `GET ${path} failed (${res.status})`);
  }

  return (await res.json()) as T;
}

// ─── The endpoints ────────────────────────────────────────────────────────

export interface ListRecipesParams {
  limit?: number;
  offset?: number;
  /** Narrow the feed to one dish's recipes. */
  dish?: string;
  /** Show only the recipes with real evidence behind them. */
  confidence?: RecipeConfidenceLevel;
  contentType?: RecipeContentType;
}

/** The FEED — every published recipe, newest first. */
export function listRecipes(
  params: ListRecipesParams = {},
): Promise<RecipeListResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.dish) qs.set("dish", params.dish);
  if (params.confidence) qs.set("confidence", params.confidence);
  if (params.contentType) qs.set("content_type", params.contentType);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<RecipeListResponse>(`/api/recipes${suffix}`);
}

export interface DishRecipesParams {
  limit?: number;
  offset?: number;
  contentType?: RecipeContentType;
}

/**
 * The HUB — the published recipes of ONE dish.
 *
 * A dish that is not published is a 404 here, exactly as the Atlas's own
 * dish route treats it: a hub for a dish that is not on the site is not a
 * page on the site.
 */
export function listDishRecipes(
  slug: string,
  params: DishRecipesParams = {},
): Promise<RecipeHubResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.contentType) qs.set("content_type", params.contentType);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<RecipeHubResponse>(
    `/api/dishes/${encodeURIComponent(slug)}/recipes${suffix}`,
  );
}

/**
 * ONE recipe.
 *
 * A recipe that is not published is a 404 — the same 404 as a slug that
 * does not exist. The page must not be able to tell them apart.
 */
export function getRecipe(slug: string): Promise<RecipeDetailResponse> {
  return request<RecipeDetailResponse>(
    `/api/recipes/${encodeURIComponent(slug)}`,
  );
}

/**
 * The kill switch, read-only.
 *
 * It is public on purpose: a reader deserves to know whether the recipes
 * they see were published by a human or by the auto-publish path, and
 * whether that path is even on. It exposes no secret.
 */
export function getRecipeSettings(): Promise<RecipeSettingsResponse> {
  return request<RecipeSettingsResponse>("/api/recipes/settings");
}
