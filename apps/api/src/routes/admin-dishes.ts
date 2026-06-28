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
  tags,
  media,
  mediaAttachments,
  sources,
  citations,
  editHistory,
  type EditAction,
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

  // ─── GET /api/admin/stats ────────────────────────────────────────────
  // Aggregate counts for the admin dashboard control center. Read-only,
  // admin-gated. Returns dish status counts, taxonomy term counts, total
  // media, and content-health gaps (dishes missing a cover photo, a
  // description, any source, or an origin). One round-trip; cheap at the
  // current corpus size. The dashboard degrades gracefully if this
  // endpoint is absent (older deploy) by deriving partial counts from
  // /api/admin/dishes + /api/admin/lookups instead.
  app.get('/api/admin/stats', async (request, reply) => {
    await app.requireRole(request, 'admin');

    const [
      dishCounts,
      healthCounts,
      catCount,
      familyCount,
      methodCount,
      geoCount,
      ingCount,
      tagCount,
      mediaCount,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`cast(count(*) as int)`,
          published: sql<number>`cast(count(*) filter (where ${dishes.status} = 'published') as int)`,
          draft: sql<number>`cast(count(*) filter (where ${dishes.status} = 'draft') as int)`,
          archived: sql<number>`cast(count(*) filter (where ${dishes.status} = 'archived') as int)`,
        })
        .from(dishes),
      db
        .select({
          missingDescription: sql<number>`cast(count(*) filter (where ${dishes.shortDescription} is null or ${dishes.longDescription} is null) as int)`,
          missingOrigin: sql<number>`cast(count(*) filter (where ${dishes.originGeoId} is null) as int)`,
          missingPhoto: sql<number>`cast(count(*) filter (where not exists (select 1 from ${mediaAttachments} ma where ma.target_type = 'dish' and ma.target_id = ${dishes.id} and ma.role = 'cover')) as int)`,
          missingSources: sql<number>`cast(count(*) filter (where not exists (select 1 from ${citations} c where c.target_type = 'dish' and c.target_id = ${dishes.id})) as int)`,
        })
        .from(dishes),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(categories),
      db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(categories)
        .where(sql`${categories.slug} like 'family-%'`),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(preparationMethods),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(geoEntities),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(ingredients),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(tags),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(media),
    ]);

    reply.header('Cache-Control', 'private, max-age=30');
    return reply.send({
      dishes: {
        total: dishCounts[0]?.total ?? 0,
        published: dishCounts[0]?.published ?? 0,
        draft: dishCounts[0]?.draft ?? 0,
        archived: dishCounts[0]?.archived ?? 0,
      },
      taxonomy: {
        categories: catCount[0]?.n ?? 0,
        families: familyCount[0]?.n ?? 0,
        lineages: methodCount[0]?.n ?? 0,
        regions: geoCount[0]?.n ?? 0,
        ingredients: ingCount[0]?.n ?? 0,
        tags: tagCount[0]?.n ?? 0,
      },
      media: { total: mediaCount[0]?.n ?? 0 },
      health: {
        missingDescription: healthCounts[0]?.missingDescription ?? 0,
        missingPhoto: healthCounts[0]?.missingPhoto ?? 0,
        missingSources: healthCounts[0]?.missingSources ?? 0,
        missingOrigin: healthCounts[0]?.missingOrigin ?? 0,
      },
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

  // ─── GET /api/admin/dishes/:slug/sources ────────────────────────────────
  // List all citations (with their source records) for a dish. Used by
  // the admin Sources tab. Order: most recent first.
  app.get('/api/admin/dishes/:slug/sources', async (request, reply) => {
    await app.requireRole(request, 'admin');
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);

    const dishRows = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (dishRows.length === 0) {
      throw httpError(404, 'not_found', `Dish "${slug}" not found`);
    }
    const dishId = dishRows[0]!.id;

    const rows = await db
      .select({
        id: citations.id,
        claimText: citations.claimText,
        location: citations.location,
        addedAt: citations.addedAt,
        sourceId: sources.id,
        sourceType: sources.sourceType,
        title: sources.title,
        authors: sources.authors,
        year: sources.year,
        publisher: sources.publisher,
        url: sources.url,
        isbn: sources.isbn,
        doi: sources.doi,
        citationText: sources.citationText,
        language: sources.language,
        reliability: sources.reliability,
      })
      .from(citations)
      .innerJoin(sources, eq(citations.sourceId, sources.id))
      .where(eq(citations.targetId, dishId))
      .orderBy(desc(citations.addedAt));

    return reply.send({
      sources: rows.map((r) => ({
        citationId: r.id,
        claimText: r.claimText,
        location: r.location,
        addedAt: r.addedAt instanceof Date ? r.addedAt.toISOString() : String(r.addedAt),
        source: {
          id: r.sourceId,
          sourceType: r.sourceType,
          title: r.title,
          authors: r.authors,
          year: r.year,
          publisher: r.publisher,
          url: r.url,
          isbn: r.isbn,
          doi: r.doi,
          citationText: r.citationText,
          language: r.language,
          reliability: r.reliability,
        },
      })),
    });
  });

  // ─── POST /api/admin/dishes/:slug/sources ───────────────────────────────
  // Create a new source AND attach it as a citation on the dish in one call.
  // Body: full Source schema + optional claimText/location for the citation.
  //
  // The sources table holds the reusable citation metadata. Multiple
  // citations can point to the same source (e.g. one source supports
  // multiple claims on different dishes, or two claims on the same
  // dish). If the source already exists (by url+title), we reuse it.
  app.post('/api/admin/dishes/:slug/sources', async (request, reply) => {
    const user = await app.requireRole(request, 'admin');
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);

    const dishRows = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (dishRows.length === 0) {
      throw httpError(404, 'not_found', `Dish "${slug}" not found`);
    }
    const dishId = dishRows[0]!.id;

    const body = z
      .object({
        // Source fields
        sourceType: z.enum([
          'book', 'article', 'web', 'video', 'audio', 'archive', 'personal_communication',
        ]),
        title: z.string().min(2).max(500),
        authors: z.array(z.string().min(1).max(200)).optional(),
        year: z.number().int().min(-3000).max(2100).nullable().optional(),
        publisher: z.string().max(200).nullable().optional(),
        isbn: z.string().max(40).nullable().optional(),
        doi: z.string().max(200).nullable().optional(),
        url: z.string().url().max(2000).nullable().optional(),
        archiveName: z.string().max(200).nullable().optional(),
        archiveCatalogId: z.string().max(200).nullable().optional(),
        citationText: z.string().max(5000).nullable().optional(),
        language: z.string().length(2).default('en'),
        reliability: z.enum(['primary', 'secondary', 'tertiary', 'speculative']).nullable().optional(),
        // Citation fields
        claimText: z.string().max(2000).nullable().optional(),
        location: z.string().max(500).nullable().optional(),
      })
      .parse(request.body);

    // Reuse existing source if URL+title match. Two citations can point at
    // the same source for different claims; dedup avoids duplicates.
    let sourceId: string;
    if (body.url) {
      const existing = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.title, body.title), eq(sources.url, body.url)))
        .limit(1);
      if (existing.length > 0) {
        sourceId = existing[0]!.id;
      } else {
        const inserted = await db
          .insert(sources)
          .values({
            sourceType: body.sourceType,
            title: body.title,
            authors: body.authors ?? null,
            year: body.year ?? null,
            publisher: body.publisher ?? null,
            isbn: body.isbn ?? null,
            doi: body.doi ?? null,
            url: body.url ?? null,
            archiveName: body.archiveName ?? null,
            archiveCatalogId: body.archiveCatalogId ?? null,
            citationText: body.citationText ?? null,
            language: body.language,
            reliability: body.reliability ?? null,
            createdBy: user.id,
          })
          .returning({ id: sources.id });
        sourceId = inserted[0]!.id;
      }
    } else {
      // No URL — must create new (URL is the natural dedup key).
      const inserted = await db
        .insert(sources)
        .values({
          sourceType: body.sourceType,
          title: body.title,
          authors: body.authors ?? null,
          year: body.year ?? null,
          publisher: body.publisher ?? null,
          isbn: body.isbn ?? null,
          doi: body.doi ?? null,
          url: null,
          archiveName: body.archiveName ?? null,
          archiveCatalogId: body.archiveCatalogId ?? null,
          citationText: body.citationText ?? null,
          language: body.language,
          reliability: body.reliability ?? null,
          createdBy: user.id,
        })
        .returning({ id: sources.id });
      sourceId = inserted[0]!.id;
    }

    // Create the citation linking this dish to the source.
    const citationInserted = await db
      .insert(citations)
      .values({
        sourceId,
        targetType: 'dish',
        targetId: dishId,
        claimText: body.claimText ?? null,
        location: body.location ?? null,
      })
      .returning({
        id: citations.id,
        claimText: citations.claimText,
        location: citations.location,
        addedAt: citations.addedAt,
      });
    const citationRow = citationInserted[0]!;

    // Audit trail
    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: dishId,
      action: 'update' satisfies EditAction,
      diff: { sourcesAdded: { title: body.title, claimText: body.claimText ?? null } },
      comment: `Added source: ${body.title}`,
    });

    return reply.status(201).send({
      citation: {
        id: citationRow.id,
        claimText: citationRow.claimText,
        location: citationRow.location,
        addedAt:
          citationRow.addedAt instanceof Date
            ? citationRow.addedAt.toISOString()
            : String(citationRow.addedAt),
        sourceId,
      },
    });
  });

  // ─── PATCH /api/admin/dishes/:slug/sources/:citationId ─────────────────
  // Update the citation's claimText/location AND/OR the source metadata.
  // Body is the same shape as POST but all fields optional.
  app.patch('/api/admin/dishes/:slug/sources/:citationId', async (request, reply) => {
    const user = await app.requireRole(request, 'admin');
    const { slug, citationId } = z
      .object({
        slug: z.string().min(1).max(200),
        citationId: z.string().uuid(),
      })
      .parse(request.params);

    const dishRows = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (dishRows.length === 0) {
      throw httpError(404, 'not_found', `Dish "${slug}" not found`);
    }
    const dishId = dishRows[0]!.id;

    const body = z
      .object({
        claimText: z.string().max(2000).nullable().optional(),
        location: z.string().max(500).nullable().optional(),
        // Source metadata updates
        title: z.string().min(2).max(500).optional(),
        authors: z.array(z.string().min(1).max(200)).nullable().optional(),
        year: z.number().int().min(-3000).max(2100).nullable().optional(),
        publisher: z.string().max(200).nullable().optional(),
        url: z.string().url().max(2000).nullable().optional(),
        isbn: z.string().max(40).nullable().optional(),
        doi: z.string().max(200).nullable().optional(),
        citationText: z.string().max(5000).nullable().optional(),
        reliability: z.enum(['primary', 'secondary', 'tertiary', 'speculative']).nullable().optional(),
      })
      .parse(request.body);

    // Verify citation belongs to this dish.
    const existing = await db
      .select({
        id: citations.id,
        sourceId: citations.sourceId,
      })
      .from(citations)
      .where(and(eq(citations.id, citationId), eq(citations.targetId, dishId)))
      .limit(1);
    if (existing.length === 0) {
      throw httpError(404, 'citation_not_found', `Citation ${citationId} not found on ${slug}`);
    }
    const sourceId = existing[0]!.sourceId;

    // Update citation if requested.
    const citationUpdates: Record<string, unknown> = {};
    if (body.claimText !== undefined) citationUpdates.claimText = body.claimText;
    if (body.location !== undefined) citationUpdates.location = body.location;
    if (Object.keys(citationUpdates).length > 0) {
      await db.update(citations).set(citationUpdates).where(eq(citations.id, citationId));
    }

    // Update source if any source field provided.
    const sourceUpdates: Record<string, unknown> = {};
    if (body.title !== undefined) sourceUpdates.title = body.title;
    if (body.authors !== undefined) sourceUpdates.authors = body.authors;
    if (body.year !== undefined) sourceUpdates.year = body.year;
    if (body.publisher !== undefined) sourceUpdates.publisher = body.publisher;
    if (body.url !== undefined) sourceUpdates.url = body.url;
    if (body.isbn !== undefined) sourceUpdates.isbn = body.isbn;
    if (body.doi !== undefined) sourceUpdates.doi = body.doi;
    if (body.citationText !== undefined) sourceUpdates.citationText = body.citationText;
    if (body.reliability !== undefined) sourceUpdates.reliability = body.reliability;
    if (Object.keys(sourceUpdates).length > 0) {
      await db.update(sources).set(sourceUpdates).where(eq(sources.id, sourceId));
    }

    // Audit trail
    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: dishId,
      action: 'update' satisfies EditAction,
      diff: {
        citationUpdated: { citationId, ...citationUpdates },
        sourceUpdated: sourceUpdates,
      },
      comment: `Updated source ${citationId}`,
    });

    return reply.send({ citationId, updated: true });
  });

  // ─── DELETE /api/admin/dishes/:slug/sources/:citationId ────────────────
  // Remove the citation link between this dish and its source. The source
  // row itself is preserved — it may be referenced by other dishes.
  app.delete('/api/admin/dishes/:slug/sources/:citationId', async (request, reply) => {
    const user = await app.requireRole(request, 'admin');
    const { slug, citationId } = z
      .object({
        slug: z.string().min(1).max(200),
        citationId: z.string().uuid(),
      })
      .parse(request.params);

    const dishRows = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (dishRows.length === 0) {
      throw httpError(404, 'not_found', `Dish "${slug}" not found`);
    }
    const dishId = dishRows[0]!.id;

    const existing = await db
      .select({ id: citations.id })
      .from(citations)
      .where(and(eq(citations.id, citationId), eq(citations.targetId, dishId)))
      .limit(1);
    if (existing.length === 0) {
      throw httpError(404, 'citation_not_found', `Citation ${citationId} not found on ${slug}`);
    }

    await db.delete(citations).where(eq(citations.id, citationId));

    // Audit trail
    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: dishId,
      action: 'update' satisfies EditAction,
      diff: { citationRemoved: { citationId } },
      comment: `Removed source citation ${citationId}`,
    });

    return reply.send({ removed: true, citationId });
  });
}