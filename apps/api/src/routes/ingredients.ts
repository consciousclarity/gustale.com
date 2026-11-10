/**
 * Ingredient read routes — Phase 9-prep.
 *
 * - GET /api/ingredients           flat list with dishCount (for /ingredients index page)
 * - GET /api/ingredients/:slug     single ingredient + the dishes that use it
 *
 * This is a stub-quality read API: it powers the per-ingredient page that
 * was 404'ing when clicked from the dish-detail ingredient list. Future work
 * (Phase 9 discoverability) will add search, filtering, and per-region
 * ingredient lists.
 *
 * Auth: public — ingredients are encyclopedia entries like dishes.
 */

import {
  db,
  dishes,
  dishIngredients,
  ingredientAliases,
  ingredients,
} from "@gustale/db";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { httpError } from "../errors.js";

const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

/**
 * Resolve a RETIRED ingredient slug to its canonical ingredient.
 *
 * An alias whose target is NOT published resolves to nothing: a draft
 * must not become publicly reachable by asking for a different slug.
 * That filter lives HERE, at the alias layer, and it is the only place
 * it can be -- the canonical lookup that follows also filters on
 * `published`, but by then the alias has already chosen a target.
 *
 * Exported so the test can exercise this layer directly. Removing the
 * `published` filter here would still produce a 404 at the API
 * (the second lookup refuses the draft), so the behaviour is only
 * observable through this function.
 */
export async function resolveIngredientAlias(
  slug: string,
): Promise<{ canonicalSlug: string; canonicalId: string }[]> {
  // The alias table is migration 0056. A database that has not applied
  // it yet has no such table, and the lookup would raise "relation
  // does not exist" -- turning every ingredient page into a 500. So
  // the table's presence is checked first, and its ABSENCE means
  // "there are no aliases", which is exactly the truth.
  //
  // This is not a workaround for a missing migration: 0056 is applied
  // by the CI chain and the live apply. It is so that a deployment
  // whose database is one migration behind degrades to the pre-alias
  // behaviour -- serving the ingredient by its own slug -- instead of
  // failing every request.
  const present = (await db.execute(sql`
    SELECT count(*)::int AS n
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'ingredient_aliases'
  `)) as unknown as { n: number }[];

  if ((present[0]?.n ?? 0) === 0) {
    return [];
  }

  return db
    .select({
      canonicalSlug: ingredients.slug,
      canonicalId: ingredients.id,
    })
    .from(ingredientAliases)
    .innerJoin(ingredients, eq(ingredients.id, ingredientAliases.ingredientId))
    .where(
      sql`${ingredientAliases.aliasSlug} = ${slug} AND ${ingredients.status} = 'published'`,
    )
    .limit(1);
}

export const registerIngredientRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/ingredients ───────────────────────────────────────────────
  // Flat list — name, slug, dishCount. Paginated so it can power a future
  // /ingredients index page without rewrite.
  app.get("/api/ingredients", async (request, reply) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .safeParse(request.query);
    if (!q.success) {
      throw httpError(
        400,
        "invalid_query",
        q.error.issues[0]?.message ?? "invalid query",
      );
    }
    const { limit, offset } = q.data;

    // LEFT JOIN so ingredients with zero dishes still show up (count = 0).
    // Group by ingredient so COUNT(*) gives us per-ingredient dish count.
    const rows = await db
      .select({
        slug: ingredients.slug,
        canonicalName: ingredients.canonicalName,
        category: ingredients.category,
        dishCount: sql<number>`COUNT(${dishes.id})::int`,
      })
      .from(ingredients)
      .leftJoin(
        dishIngredients,
        eq(dishIngredients.ingredientId, ingredients.id),
      )
      .leftJoin(
        dishes,
        sql`${dishes.id} = ${dishIngredients.dishId} AND ${dishes.status} = 'published'`,
      )
      .where(eq(ingredients.status, "published"))
      .groupBy(ingredients.id)
      .orderBy(sql`${ingredients.canonicalName} ASC`)
      .limit(limit)
      .offset(offset);

    return { ingredients: rows };
  });

  // ── GET /api/ingredients/:slug ──────────────────────────────────────────
  // One ingredient + the dishes that use it. Used by the /ingredients/:slug page.
  app.get("/api/ingredients/:slug", async (request, reply) => {
    const params = slugParamSchema.safeParse(request.params);
    if (!params.success) {
      throw httpError(
        400,
        "invalid_slug",
        params.error.issues[0]?.message ?? "invalid slug",
      );
    }
    const { slug } = params.data;

    // ── The alias resolution ───────────────────────────────────────────
    //
    // A retired slug must keep resolving. `bechamel-sauce` is the
    // béchamel ingredient under an old slug, and it has a live public
    // URL -- so the request is answered with the CANONICAL ingredient
    // rather than a 404. The response says which slug was asked for
    // and which one it resolved to, so a client can tell it was
    // redirected without following a redirect.
    const alias = await resolveIngredientAlias(slug);

    const resolvedSlug = alias[0]?.canonicalSlug ?? slug;

    const ing = await db
      .select()
      .from(ingredients)
      .where(
        sql`${ingredients.slug} = ${resolvedSlug} AND ${ingredients.status} = 'published'`,
      )
      .limit(1);
    if (ing.length === 0) {
      throw httpError(
        404,
        "not_found",
        `No published ingredient with slug "${slug}"`,
      );
    }
    const ingredient = ing[0]!;

    // Get dishes that use this ingredient — only published, joined to dishes
    // for slug/name/origin so the page can link to them.
    const usedIn = await db
      .select({
        dishSlug: dishes.slug,
        dishName: dishes.canonicalName,
        isOptional: dishIngredients.isOptional,
        position: dishIngredients.position,
      })
      .from(dishIngredients)
      .innerJoin(dishes, eq(dishes.id, dishIngredients.dishId))
      .where(
        sql`${dishIngredients.ingredientId} = ${ingredient.id} AND ${dishes.status} = 'published'`,
      )
      .orderBy(dishIngredients.position);

    return {
      ingredient: {
        slug: ingredient.slug,
        canonicalName: ingredient.canonicalName,
        scientificName: ingredient.scientificName,
        category: ingredient.category,
        shortDescription: ingredient.shortDescription,
        longDescription: ingredient.longDescription,
      },
      dishes: usedIn,
      // Set ONLY when the requested slug was a retired alias. It tells
      // the client the canonical slug, so a page can link forward
      // instead of stranding the visitor on the old URL.
      ...(alias[0]
        ? {
            alias: {
              requestedSlug: slug,
              canonicalSlug: alias[0].canonicalSlug,
            },
          }
        : {}),
    };
  });
};
