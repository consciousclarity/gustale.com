/**
 * Admin lookup endpoints — Phase 4 (Admin Dish Editor redo).
 *
 * These endpoints feed the admin dish editor UI. They are READ-ONLY and
 * require admin auth (app.requireRole(request, 'admin')). The write path
 * is the existing PATCH /api/dishes/:slug in dishes-write.ts (Phase 7c).
 *
 * Endpoints:
 *   GET /api/admin/lookups               — all categories, methods, geos, ingredients
 *   GET /api/admin/dishes                — paginated dish list with search + status filter
 *   GET /api/admin/dishes/:slug          — full dish detail for editor SSR
 *
 * This file does NOT touch dishes.ts (read API) or dish-relations.ts
 * (PR #5 relations endpoint). Adding admin endpoints here keeps the public
 * read API and the relations endpoint completely untouched.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  db,
  dishes,
  dishIngredients,
  dishPreparations,
  dishCategories,
  dishRelations,
  categories,
  preparationMethods,
  geoEntities,
  ingredients,
} from '@gustale/db';
import { httpError } from '../errors.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────

const listAdminDishesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

// ─── Route registration ───────────────────────────────────────────────────

export function registerAdminDishRoutes(app: FastifyInstance): void {
  // ─── GET /api/admin/lookups ──────────────────────────────────────────
  // Single round-trip that returns all the lookup data the editor needs
  // to populate <select> / multi-select inputs. Read-only, cacheable.
  app.get('/api/admin/lookups', async (request, reply) => {
    await app.requireRole(request, 'admin');

    const [cats, methods, geos, ings] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          kind: sql<string>`(SELECT 'cuisine'::text)`.as('kind_cuisine'),
          // The actual `kind` column is missing on the live DB; we fall back
          // to a slug prefix heuristic so the UI can still group.
        })
        .from(categories)
        .orderBy(asc(categories.name))
        .limit(500),
      db
        .select({
          id: preparationMethods.id,
          name: preparationMethods.name,
          slug: preparationMethods.slug,
        })
        .from(preparationMethods)
        .orderBy(asc(preparationMethods.name))
        .limit(500),
      db
        .select({
          id: geoEntities.id,
          name: geoEntities.name,
          country: geoEntities.name,
        })
        .from(geoEntities)
        .orderBy(asc(geoEntities.name))
        .limit(2000),
      db
        .select({
          id: ingredients.id,
          canonicalName: ingredients.canonicalName,
        })
        .from(ingredients)
        .orderBy(asc(ingredients.canonicalName))
        .limit(2000),
    ]);

    // Augment categories with a kind heuristic based on slug prefix so the
    // editor can group "cuisine" vs "dish-type" vs "family" categories
    // without a `kind` column. This is best-effort; the editor still
    // works if the heuristic is wrong.
    const augmentedCats = cats.map((c) => ({
      ...c,
      kind: c.slug.startsWith('family-')
        ? ('family' as const)
        : c.slug.includes('cuisine') || /-(chinese|italian|japanese|korean|thai|indian|french|mexican|greek|spanish|indonesian|malaysian|vietnamese|lebanese|turkish|persian|american|british|german|portuguese|brazilian|russian|polish|hungarian|swedish|norwegian|dutch|ethiopian|senegalese|maroccan|egyptian|kenyan|peruvian|argentinian|chilean|venezuelan|cuban|jamaican|cajun|creole)$/i.test(c.slug)
          ? ('cuisine' as const)
          : ('dish-type' as const),
    }));

    reply.header('Cache-Control', 'private, max-age=60');
    return reply.send({
      categories: augmentedCats,
      preparationMethods: methods,
      geoEntities: geos,
      ingredients: ings,
    });
  });

  // ─── GET /api/admin/dishes ───────────────────────────────────────────
  // Paginated dish list with optional search + status filter. Used by
  // the admin dish index page. Returns total count for pagination UI.
  app.get('/api/admin/dishes', async (request, reply) => {
    await app.requireRole(request, 'admin');
    const params = listAdminDishesQuerySchema.parse(request.query);

    const whereParts = [] as ReturnType<typeof eq>[];
    if (params.status) {
      whereParts.push(eq(dishes.status, params.status));
    }
    if (params.q) {
      const q = `%${params.q}%`;
      const match = or(
        ilike(dishes.canonicalName, q),
        ilike(dishes.shortDescription, q),
        ilike(dishes.slug, q),
      );
      if (match) whereParts.push(match);
    }

    const whereExpr = whereParts.length === 0 ? undefined : whereParts.length === 1 ? whereParts[0] : and(...whereParts);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: dishes.id,
          slug: dishes.slug,
          canonicalName: dishes.canonicalName,
          shortDescription: dishes.shortDescription,
          status: dishes.status,
          viewCount: dishes.viewCount,
          updatedAt: dishes.updatedAt,
          originGeoId: dishes.originGeoId,
          originName: geoEntities.name,
        })
        .from(dishes)
        .leftJoin(geoEntities, eq(geoEntities.id, dishes.originGeoId))
        .where(whereExpr)
        .orderBy(desc(dishes.updatedAt), asc(dishes.canonicalName))
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(dishes)
        .where(whereExpr),
    ]);

    return reply.send({
      dishes: rows.map((r) => ({
        ...r,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      })),
      total: totalRows[0]?.n ?? 0,
    });
  });

  // ─── GET /api/admin/dishes/:slug ──────────────────────────────────────
  // Full dish detail for the editor SSR. Includes joined ingredients,
  // preparation methods, categories, and related dishes.
  app.get('/api/admin/dishes/:slug', async (request, reply) => {
    await app.requireRole(request, 'admin');
    const { slug } = slugParamSchema.parse(request.params);

    const dishRows = await db
      .select()
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (dishRows.length === 0) {
      throw httpError(404, 'not_found', `Dish "${slug}" not found`);
    }
    const dish = dishRows[0]!;

    const [ingredientRows, prepRows, catRows, relatedRows] = await Promise.all([
      // dish_ingredients is a junction table (no id column). Returns one
      // row per (dishId, ingredientId) pair, ordered by `position`.
      db
        .select({
          ingredientId: dishIngredients.ingredientId,
          ingredientName: ingredients.canonicalName,
          quantity: dishIngredients.quantity,
          unit: dishIngredients.unit,
          isOptional: dishIngredients.isOptional,
          preparationNote: dishIngredients.preparationNote,
          position: dishIngredients.position,
        })
        .from(dishIngredients)
        .leftJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
        .where(eq(dishIngredients.dishId, dish.id))
        .orderBy(asc(dishIngredients.position)),
      db
        .select({
          id: dishPreparations.id,
          methodId: dishPreparations.methodId,
          methodName: preparationMethods.name,
          methodSlug: preparationMethods.slug,
          sequenceOrder: dishPreparations.sequenceOrder,
        })
        .from(dishPreparations)
        .leftJoin(preparationMethods, eq(preparationMethods.id, dishPreparations.methodId))
        .where(eq(dishPreparations.dishId, dish.id))
        .orderBy(asc(dishPreparations.sequenceOrder)),
      // dish_categories is also a junction table (no id). One row per
      // (dishId, categoryId) pair.
      db
        .select({
          categoryId: dishCategories.categoryId,
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(dishCategories)
        .leftJoin(categories, eq(categories.id, dishCategories.categoryId))
        .where(eq(dishCategories.dishId, dish.id)),
      // Related dishes via dish_relations (both directions).
      db
        .select({
          id: dishRelations.id,
          relationType: dishRelations.relationType,
          reason: dishRelations.reason,
          strength: dishRelations.strength,
          relatedDishId: dishRelations.toDishId,
          relatedSlug: sql<string>`(SELECT d2.slug FROM dishes d2 WHERE d2.id = ${dishRelations.toDishId})`,
          relatedName: sql<string>`(SELECT d2.canonical_name FROM dishes d2 WHERE d2.id = ${dishRelations.toDishId})`,
        })
        .from(dishRelations)
        .where(eq(dishRelations.fromDishId, dish.id))
        .orderBy(desc(dishRelations.strength))
        .limit(50),
    ]);

    return reply.send({
      id: dish.id,
      slug: dish.slug,
      canonicalName: dish.canonicalName,
      shortDescription: dish.shortDescription,
      longDescription: dish.longDescription,
      status: dish.status,
      originGeoId: dish.originGeoId,
      originDateEarliest: dish.originDateEarliest,
      originDateLatest: dish.originDateLatest,
      originPeriodLabel: null, // column not in schema; reserved for future
      viewCount: dish.viewCount,
      editCount: dish.editCount,
      updatedAt: dish.updatedAt instanceof Date ? dish.updatedAt.toISOString() : String(dish.updatedAt),
      ingredients: ingredientRows,
      preparations: prepRows,
      categories: catRows,
      relatedDishes: relatedRows,
    });
  });
}