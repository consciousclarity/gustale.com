/**
 * Recipe read routes — item 4 of the recipes task.
 *
 * - GET /api/recipes                 the FEED: every published recipe, newest first
 * - GET /api/recipes/:slug           ONE recipe: its sentences, its ingredients, its confidence
 * - GET /api/dishes/:slug/recipes    the HUB: the published recipes of one dish
 *
 * THE PUBLISH GATE
 * ----------------
 * Every one of these reads `recipe_published`, the VIEW created by
 * migration 0053 — not `recipes` directly. That is the whole point of
 * the view, and it is why the view carries the scope clause itself:
 *
 * A recipe is live because its STATEMENTS are published, not because a
 * column says so (ADR-007-A1 §8.4). The auto-publish function
 * transitions the recipe's statements; it never writes `recipes.status`.
 * So a query against `recipes` would serve DRAFTS, and a query against
 * `recipe_publishable` (0052's view) would serve NOTHING — that view's
 * predicate requires `recipes.status = 'published'`, and no code path
 * writes it.
 *
 * The view's predicate is:
 *
 *   the dish is published
 *   AND the recipe is not archived and not rejected
 *   AND the recipe has a sentence
 *   AND every sentence has a verified-or-published statement
 *   AND every such statement is ABOUT THIS RECIPE
 *
 * The last clause is the SCOPE CLAUSE (ADR-007-A1 §8.5). `statements`
 * is shared with the Atlas, so without it an Atlas statement could make
 * a recipe look published. The view carries it rather than trusting
 * the trigger on `recipe_claims`, because a trigger can be dropped by
 * a superuser or by a later migration.
 *
 * THE CONFIDENCE
 * --------------
 * The confidence is COMPUTED by the database — `recipe_confidence`,
 * written by 0052's `recipe_auto_publish()`, and computed by
 * `recipe_compute_confidence()`. The API never computes it and never
 * sets it (ADR-007-A1 §8.3): the publish path and the UI must read
 * the SAME number, so it has to live in one place.
 *
 * A NULL confidence means "not computed" — the recipe has never been
 * through the publish path — and it is reported as null. It is NOT
 * reported as "low": "low" is a computed level that says something
 * about the evidence, and null says something different.
 *
 * Auth: public. A published recipe is encyclopedia content.
 */

import { db } from "@gustale/db";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { httpError } from "../errors.js";

// ── The query schemas ────────────────────────────────────────────────────

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  // The dish's slug, so the feed can be narrowed to one dish's recipes.
  dish: z.string().min(1).max(200).optional(),
  // The confidence level, so the feed can show only the recipes with
  // real evidence behind them.
  confidence: z.enum(["high", "medium", "low"]).optional(),
  // The recipe's own content type ('recipe', 'variation', 'base', ...).
  content_type: z
    .enum(["recipe", "variation", "technique", "base", "template"])
    .optional(),
});

const hubParamsSchema = z.object({
  slug: z.string().min(1).max(200),
});

const hubQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  content_type: z
    .enum(["recipe", "variation", "technique", "base", "template"])
    .optional(),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

// ── The row shape the feed and the hub share ─────────────────────────────

interface RecipeListRow {
  id: string;
  slug: string;
  title: string;
  dish_id: string;
  dish_slug: string;
  dish_name: string;
  content_type: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  confidence: string | null;
  // A timestamptz comes back as a string OR a Date, depending on the
  // driver's parser -- so it is typed as `string | Date` and normalised
  // by `isoOrNull`, exactly as the dish list does for `updated_at`.
  published_at: string | Date | null;
}

/**
 * Normalise a timestamp to an ISO string, or null.
 *
 * The driver may hand back a `Date` or a `string` for a timestamptz, so
 * both are accepted. A string is passed through -- it is already
 * ISO-formatted by the driver -- and a Date is converted.
 */
function isoOrNull(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

// The LIST query. It reads the VIEW, and it selects the dish's name and
// slug alongside the recipe's, because every card in the feed shows
// which dish the recipe belongs to.
const LIST_COLUMNS = sql`
  p.id,
  p.slug,
  p.title,
  p.dish_id,
  d.slug AS dish_slug,
  d.canonical_name AS dish_name,
  p.content_type,
  p.servings,
  p.prep_minutes,
  p.cook_minutes,
  p.confidence,
  p.published_at
`;

/**
 * Shape one row for the response.
 *
 * The shape matches the dish list's: camelCase keys, the same
 * `servings`/`prep_minutes`/`cook_minutes` names the front-end already
 * reads for the Atlas, and the same `total`/`hasMore` pair.
 */
function shapeRecipe(row: RecipeListRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    // The dish it belongs to, so a card can link to the hub.
    dish: {
      slug: row.dish_slug,
      name: row.dish_name,
    },
    contentType: row.content_type as
      | "recipe"
      | "variation"
      | "technique"
      | "base"
      | "template",
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    // The COMPUTED confidence. null means "not computed" — the recipe
    // has never been through the publish path.
    confidence: row.confidence as "high" | "medium" | "low" | null,
    publishedAt: isoOrNull(row.published_at),
  };
}

/**
 * Run the count for a list query.
 *
 * The count uses THE SAME WHERE as the page query, so `total` and the
 * list cannot contradict each other. It is a second query rather than
 * a window function because the page query joins `dishes`, and a
 * window count would have to reproduce that join exactly.
 */
async function countPublished(where: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS total
      FROM public.recipe_published p
      JOIN public.dishes d ON d.id = p.dish_id
     WHERE ${where}
  `)) as unknown as { total: number }[];
  return rows[0]?.total ?? 0;
}

export const registerRecipeRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/recipes ────────────────────────────────────────────────
  // The FEED. Every published recipe, newest first.
  app.get("/api/recipes", async (request) => {
    const params = feedQuerySchema.safeParse(request.query);
    if (!params.success) {
      throw httpError(
        400,
        "invalid_query",
        params.error.issues[0]?.message ?? "invalid query",
      );
    }
    const { limit, offset } = params.data;

    const whereFragments: SQL[] = [];
    if (params.data.dish) {
      whereFragments.push(sql`d.slug = ${params.data.dish}`);
    }
    if (params.data.confidence) {
      whereFragments.push(sql`p.confidence = ${params.data.confidence}`);
    }
    if (params.data.content_type) {
      whereFragments.push(sql`p.content_type = ${params.data.content_type}`);
    }
    const where =
      whereFragments.length > 1
        ? sql.join(whereFragments, sql` AND `)
        : (whereFragments[0] ?? sql`TRUE`);

    // Raw SQL, to match the dish list: Drizzle's postgres-js prepared
    // statements do not play well with a scalar subquery in .select().
    // Every value is parameterised through ${}, so there is no
    // injection risk.
    const rows = (await db.execute(sql`
      SELECT ${LIST_COLUMNS}
        FROM public.recipe_published p
        JOIN public.dishes d ON d.id = p.dish_id
       WHERE ${where}
       ORDER BY p.published_at DESC NULLS LAST, p.title ASC
       LIMIT ${limit}
       OFFSET ${offset}
    `)) as unknown as RecipeListRow[];

    const total = await countPublished(where);
    const result = rows.map(shapeRecipe);

    return {
      recipes: result,
      limit,
      offset,
      // The number of recipes that MATCH the filters, not the number in
      // this page — the same contract the dish list uses.
      total,
      // Computed from `total`, so it cannot disagree with it.
      hasMore: offset + result.length < total,
    };
  });

  // ── GET /api/dishes/:slug/recipes ───────────────────────────────────
  // The HUB: the published recipes of ONE dish (ADR-007-A1 §5.1).
  //
  // It is registered under /api/dishes/:slug/recipes rather than
  // /api/recipes?dish= so the hub has its own URL to point at, and it
  // returns the dish's own header so the page does not need a second
  // request for it.
  app.get("/api/dishes/:slug/recipes", async (request) => {
    const params = hubParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw httpError(
        400,
        "invalid_slug",
        params.error.issues[0]?.message ?? "invalid slug",
      );
    }
    const query = hubQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw httpError(
        400,
        "invalid_query",
        query.error.issues[0]?.message ?? "invalid query",
      );
    }
    const { slug } = params.data;
    const { limit, offset } = query.data;

    // The dish. It must be PUBLISHED — a hub for a dish that is not
    // published is a hub for a page that is not on the site.
    const dishRows = (await db.execute(sql`
      SELECT d.id, d.slug, d.canonical_name, d.short_description
        FROM public.dishes d
       WHERE d.slug = ${slug} AND d.status = 'published'
       LIMIT 1
    `)) as unknown as {
      id: string;
      slug: string;
      canonical_name: string;
      short_description: string | null;
    }[];

    if (dishRows.length === 0) {
      throw httpError(
        404,
        "not_found",
        `No published dish with slug "${slug}"`,
      );
    }
    const dish = dishRows[0]!;

    const whereFragments: SQL[] = [sql`d.id = ${dish.id}`];
    if (query.data.content_type) {
      whereFragments.push(sql`p.content_type = ${query.data.content_type}`);
    }
    const where =
      whereFragments.length > 1
        ? sql.join(whereFragments, sql` AND `)
        : whereFragments[0]!;

    const rows = (await db.execute(sql`
      SELECT ${LIST_COLUMNS}
        FROM public.recipe_published p
        JOIN public.dishes d ON d.id = p.dish_id
       WHERE ${where}
       ORDER BY p.published_at DESC NULLS LAST, p.title ASC
       LIMIT ${limit}
       OFFSET ${offset}
    `)) as unknown as RecipeListRow[];

    const total = await countPublished(where);
    const result = rows.map(shapeRecipe);

    return {
      dish: {
        slug: dish.slug,
        name: dish.canonical_name,
        shortDescription: dish.short_description,
      },
      recipes: result,
      limit,
      offset,
      total,
      hasMore: offset + result.length < total,
      // The hub's empty state is DERIVED from the count (ADR-007-A1
      // §5.2): a dish with no published recipe gets "No recipe yet" and
      // a noindex meta tag. The count is the only fact it depends on,
      // so the flag cannot drift from the list.
      //
      // It is the TOTAL, not the page's length: a dish with 30 recipes
      // is not empty, even on a page that returned none.
      empty: total === 0,
    };
  });

  // ── GET /api/recipes/settings ───────────────────────────────────────
  // The KILL SWITCH, read-only.
  //
  // It is a PUBLIC read because a reader deserves to know whether the
  // recipes they see were published by a human or by the auto-publish
  // path, and whether that path is even on. It exposes no secret: the
  // switch is a mode, a boolean and a cap.
  //
  // It is READ-ONLY on purpose. The API does not publish, and it does
  // not switch the publish path on: the switch is the owner's, and it
  // is changed through the same path as any other setting — by the
  // owner, deliberately (ADR-007-A1 §7.1).
  app.get("/api/recipes/settings", async () => {
    const rows = (await db.execute(sql`
      SELECT auto_publish_mode, auto_publish_enabled, auto_publish_daily_cap
        FROM public.recipe_settings
       WHERE id = true
       LIMIT 1
    `)) as unknown as {
      auto_publish_mode: string;
      auto_publish_enabled: boolean;
      auto_publish_daily_cap: number;
    }[];

    const settings = rows[0];
    if (!settings) {
      // The row is created by 0052 and is never deleted, so this is
      // unreachable in practice. It is handled rather than assumed:
      // a missing settings row means the switch's state is UNKNOWN, and
      // "unknown" must not read as "on".
      return {
        autoPublish: {
          mode: "disabled" as const,
          enabled: false,
          dailyCap: 0,
        },
      };
    }

    return {
      autoPublish: {
        mode: settings.auto_publish_mode as
          | "enabled"
          | "disabled"
          | "enabled_with_cap",
        enabled: settings.auto_publish_enabled,
        dailyCap: settings.auto_publish_daily_cap,
      },
    };
  });

  // ── GET /api/recipes/:slug ──────────────────────────────────────────
  // ONE recipe: its sentences, its ingredients, its confidence, and the
  // dish it belongs to.
  app.get("/api/recipes/:slug", async (request) => {
    const params = slugParamSchema.safeParse(request.params);
    if (!params.success) {
      throw httpError(
        400,
        "invalid_slug",
        params.error.issues[0]?.message ?? "invalid slug",
      );
    }
    const { slug } = params.data;

    // The recipe, read through the VIEW. A recipe that is not published
    // is simply not there — the same 404 as a slug that does not exist,
    // so the endpoint does not leak the existence of a draft.
    const recipeRows = (await db.execute(sql`
      SELECT
        p.id,
        p.slug,
        p.title,
        p.dish_id,
        d.slug AS dish_slug,
        d.canonical_name AS dish_name,
        p.content_type,
        p.servings,
        p.prep_minutes,
        p.cook_minutes,
        p.confidence,
        p.published_at
      FROM public.recipe_published p
      JOIN public.dishes d ON d.id = p.dish_id
      WHERE p.slug = ${slug}
      LIMIT 1
    `)) as unknown as RecipeListRow[];

    if (recipeRows.length === 0) {
      throw httpError(
        404,
        "not_found",
        `No published recipe with slug "${slug}"`,
      );
    }
    const recipe = recipeRows[0]!;

    // The CONFIDENCE, in full. `conditions_met` holds every failing
    // condition, so the page can say WHICH condition failed rather than
    // only that it did not reach HIGH (ADR-007-A1 §8.3).
    //
    // It is read from the same table the view reads, so the level and
    // the reasons are the same pair.
    const confidenceRows = (await db.execute(sql`
      SELECT level, conditions_met, independent_sources, source_count,
             ingredient_count, sentence_count, computed_at, override_level
        FROM public.recipe_confidence
       WHERE recipe_id = ${recipe.id}
       LIMIT 1
    `)) as unknown as {
      level: string;
      conditions_met: Record<string, unknown>;
      independent_sources: unknown;
      source_count: number;
      ingredient_count: number;
      sentence_count: number;
      computed_at: string | Date;
      override_level: string | null;
    }[];

    const confidenceRow = confidenceRows[0] ?? null;

    // The SENTENCES, in order. The original-language sentence is the
    // one with `is_original = true`; a translation points at its
    // source (ADR-007-A1 §4.3).
    const sentences = (await db.execute(sql`
      SELECT id, field, locale, position, text, source_sentence_id, is_original
        FROM public.recipe_sentences
       WHERE recipe_id = ${recipe.id}
       ORDER BY position ASC
    `)) as unknown as {
      id: string;
      field: string;
      locale: string;
      position: number;
      text: string;
      source_sentence_id: string | null;
      is_original: boolean;
    }[];

    // The INGREDIENTS, in order, with the shared Atlas ingredient's
    // name and slug. Only PUBLISHED ingredients are named — an
    // unpublished ingredient is an Atlas row that is not on the site,
    // and linking to it would 404.
    const ingredientRows = (await db.execute(sql`
      SELECT
        ri.id,
        ri.quantity,
        ri.unit,
        ri.is_optional,
        ri.preparation_note,
        ri.position,
        i.slug,
        i.canonical_name
      FROM public.recipe_ingredients ri
      JOIN public.ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ${recipe.id}
        AND i.status = 'published'
      ORDER BY ri.position ASC
    `)) as unknown as {
      id: string;
      quantity: string | null;
      unit: string | null;
      is_optional: boolean;
      preparation_note: string | null;
      position: number;
      slug: string;
      canonical_name: string;
    }[];

    return {
      recipe: {
        ...shapeRecipe(recipe),
        // The sentences, grouped by field so the page can render the
        // steps, the notes and the intro.
        sentences: sentences.map((s) => ({
          id: s.id,
          field: s.field as "step" | "note" | "intro",
          locale: s.locale,
          position: s.position,
          text: s.text,
          // Whether this row is the original, or a translation of it.
          isOriginal: s.is_original,
        })),
        ingredients: ingredientRows.map((i) => ({
          id: i.id,
          ingredient: { slug: i.slug, name: i.canonical_name },
          quantity: i.quantity,
          unit: i.unit,
          isOptional: i.is_optional,
          preparationNote: i.preparation_note,
          position: i.position,
        })),
      },
      // The confidence, in full. `null` when it has never been computed
      // — and the page shows that, rather than a made-up "low".
      confidence: confidenceRow
        ? {
            level: confidenceRow.level as "high" | "medium" | "low",
            // Every failing condition, so the page can say WHICH one
            // failed. `{}` when every condition is met.
            conditionsMet: confidenceRow.conditions_met,
            independentSources: confidenceRow.independent_sources,
            sourceCount: confidenceRow.source_count,
            ingredientCount: confidenceRow.ingredient_count,
            sentenceCount: confidenceRow.sentence_count,
            computedAt: isoOrNull(confidenceRow.computed_at),
            // A reviewer's manual override, when there is one. The
            // override is reported separately so the page can show
            // that the level was set by a human rather than computed.
            overrideLevel: confidenceRow.override_level as
              | "high"
              | "medium"
              | "low"
              | null,
          }
        : null,
    };
  });
};
