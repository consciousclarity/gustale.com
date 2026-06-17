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
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, ingredients, dishIngredients, dishes } from '@gustale/db';
import { httpError } from '../errors.js';

const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

export const registerIngredientRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/ingredients ───────────────────────────────────────────────
  // Flat list — name, slug, dishCount. Paginated so it can power a future
  // /ingredients index page without rewrite.
  app.get('/api/ingredients', async (request, reply) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .safeParse(request.query);
    if (!q.success) {
      throw httpError(400, 'invalid_query', q.error.issues[0]?.message ?? 'invalid query');
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
      .leftJoin(dishIngredients, eq(dishIngredients.ingredientId, ingredients.id))
      .leftJoin(dishes, sql`${dishes.id} = ${dishIngredients.dishId} AND ${dishes.status} = 'published'`)
      .where(eq(ingredients.status, 'published'))
      .groupBy(ingredients.id)
      .orderBy(sql`${ingredients.canonicalName} ASC`)
      .limit(limit)
      .offset(offset);

    return { ingredients: rows };
  });

  // ── GET /api/ingredients/:slug ──────────────────────────────────────────
  // One ingredient + the dishes that use it. Used by the /ingredients/:slug page.
  app.get('/api/ingredients/:slug', async (request, reply) => {
    const params = slugParamSchema.safeParse(request.params);
    if (!params.success) {
      throw httpError(400, 'invalid_slug', params.error.issues[0]?.message ?? 'invalid slug');
    }
    const { slug } = params.data;

    const ing = await db
      .select()
      .from(ingredients)
      .where(sql`${ingredients.slug} = ${slug} AND ${ingredients.status} = 'published'`)
      .limit(1);
    if (ing.length === 0) {
      throw httpError(404, 'not_found', `No published ingredient with slug "${slug}"`);
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
      .where(sql`${dishIngredients.ingredientId} = ${ingredient.id} AND ${dishes.status} = 'published'`)
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
    };
  });
};