import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  eq,
  and,
  desc,
  ilike,
  or,
  sql,
  SQL,
  inArray,
} from 'drizzle-orm';
import {
  db,
  dishes,
  dishVariants,
  dishTranslations,
  ingredients,
  geoEntities,
  dishIngredients,
  dishCategories,
  categories,
  dishPreparations,
  preparationMethods,
  preparationMethodTranslations,
  citations,
  sources,
  media,
  mediaAttachments,
  users,
} from '@gustale/db';

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  language: z.string().length(2).default('en'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

/**
 * Extract lat/lng from a PostGIS geometry column via ST_X/ST_Y.
 * Returns null if the column is NULL.
 * Uses raw SQL with the column name to avoid Drizzle's column-type
 * narrowing in custom SQL helpers.
 */
async function extractLatLng(
  tableName: string,
  columnName: string,
  rowId: string,
): Promise<{ lat: number; lng: number } | null> {
  const result = await db.execute(
    sql`SELECT ST_Y(${sql.raw(`${tableName}.${columnName}`)}::geometry) AS lat,
                ST_X(${sql.raw(`${tableName}.${columnName}`)}::geometry) AS lng
          FROM ${sql.raw(tableName)}
         WHERE id = ${rowId}::uuid`,
  );
  const rows = result as unknown as Array<{ lat: number | null; lng: number | null }>;
  const row = rows[0];
  if (row?.lat == null || row?.lng == null) return null;
  return { lat: row.lat, lng: row.lng };
}

/**
 * Fire-and-forget view count increment.
 * Failure here must not break the read endpoint, so we swallow errors.
 */
function bumpViewCount(dishId: string): void {
  db.update(dishes)
    .set({ viewCount: sql`${dishes.viewCount} + 1` })
    .where(eq(dishes.id, dishId))
    .catch((err) => {
      // Use a synthetic logger entry; we don't have the request logger here.
      // eslint-disable-next-line no-console
      console.error('view_count increment failed', err);
    });
}

export function registerDishRoutes(app: FastifyInstance): void {
  // List dishes
  app.get('/api/dishes', async (request, reply) => {
    const params = listQuerySchema.parse(request.query);

    const whereClauses: SQL[] = [eq(dishes.status, params.status)];

    if (params.q) {
      whereClauses.push(
        or(
          ilike(dishes.canonicalName, `%${params.q}%`),
          ilike(dishes.shortDescription, `%${params.q}%`),
          ilike(dishes.slug, `%${params.q}%`)
        )!
      );
    }

    const result = await db
      .select({
        id: dishes.id,
        slug: dishes.slug,
        canonicalName: dishes.canonicalName,
        shortDescription: dishes.shortDescription,
        originGeoId: dishes.originGeoId,
        status: dishes.status,
        viewCount: dishes.viewCount,
      })
      .from(dishes)
      .where(and(...whereClauses))
      .orderBy(desc(dishes.viewCount), dishes.canonicalName)
      .limit(params.limit)
      .offset(params.offset);

    return { dishes: result, limit: params.limit, offset: params.offset };
  });

  // Map view: flat list of all published dishes with origin coordinates.
  // MUST be registered before /api/dishes/:slug — find-my-way's radix tree
  // should prefer static over dynamic, but registering the static path
  // first makes the routing unambiguous and survives Fastify version
  // changes.
  app.get('/api/dishes/map', async (request, reply) => {
    const params = z
      .object({
        language: z.string().length(2).default('en'),
        limit: z.coerce.number().int().min(1).max(10000).default(2000),
      })
      .parse(request.query);

    const rows = (await db.execute(sql`
      SELECT
        d.slug,
        d.canonical_name,
        d.short_description,
        d.view_count,
        ST_Y(d.origin_location::geometry)::float8 AS lat,
        ST_X(d.origin_location::geometry)::float8 AS lng,
        g.name        AS region_name,
        g.local_name  AS region_local_name,
        g.iso_code    AS region_iso_code,
        g.entity_type AS region_entity_type
      FROM dishes d
      LEFT JOIN geo_entities g ON g.id = d.origin_geo_id
      WHERE d.status = 'published'
        AND d.origin_location IS NOT NULL
      ORDER BY d.view_count DESC, d.canonical_name ASC
      LIMIT ${params.limit}
    `)) as unknown as Array<{
      slug: string;
      canonical_name: string;
      short_description: string | null;
      view_count: number;
      lat: number;
      lng: number;
      region_name: string | null;
      region_local_name: string | null;
      region_iso_code: string | null;
      region_entity_type: string | null;
    }>;

    return {
      dishes: rows.map((r) => ({
        slug: r.slug,
        canonicalName: r.canonical_name,
        shortDescription: r.short_description,
        viewCount: r.view_count,
        lat: r.lat,
        lng: r.lng,
        region: {
          name: r.region_name ?? '',
          localName: r.region_local_name,
          isoCode: r.region_iso_code,
          entityType: r.region_entity_type,
        },
      })),
      count: rows.length,
    };
  });

  // Get one dish by slug (with variants, ingredients, translations,
  // preparations, sources, media, origin geometry, editors)
  app.get('/api/dishes/:slug', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const query = request.query as { language?: string };
    const language = query.language ?? 'en';

    const dish = await db
      .select()
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);

    if (dish.length === 0) {
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
    }

    const dishRow = dish[0]!;

    // A1: drafts (and archived) are not visible to anonymous reads.
    // Authenticated moderators+ would query a different route; out of scope here.
    if (dishRow.status !== 'published') {
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
    }

    // Fire-and-forget: bump view count after the read.
    bumpViewCount(dishRow.id);

    // Translations (try requested language, then any)
    const translations = await db
      .select()
      .from(dishTranslations)
      .where(eq(dishTranslations.dishId, dishRow.id));

    const translation =
      translations.find((t) => t.language === language) ??
      translations.find((t) => t.language === 'en') ??
      null;

    // Variants
    const variants = await db
      .select()
      .from(dishVariants)
      .where(eq(dishVariants.parentDishId, dishRow.id));

    // Ingredients
    const dishIngs = await db
      .select({
        ingredientId: dishIngredients.ingredientId,
        position: dishIngredients.position,
        quantity: dishIngredients.quantity,
        unit: dishIngredients.unit,
        isOptional: dishIngredients.isOptional,
        preparationNote: dishIngredients.preparationNote,
        name: ingredients.canonicalName,
        slug: ingredients.slug,
      })
      .from(dishIngredients)
      .innerJoin(ingredients, eq(dishIngredients.ingredientId, ingredients.id))
      .where(eq(dishIngredients.dishId, dishRow.id))
      .orderBy(dishIngredients.position);

    // Categories
    const dishCats = await db
      .select({
        categoryId: dishCategories.categoryId,
        name: categories.name,
        slug: categories.slug,
        isPrimary: dishCategories.isPrimary,
      })
      .from(dishCategories)
      .innerJoin(categories, eq(dishCategories.categoryId, categories.id))
      .where(eq(dishCategories.dishId, dishRow.id));

    // Preparations: join with methods, plus translations for the requested language
    const dishPreps = await db
      .select({
        id: dishPreparations.id,
        methodId: dishPreparations.methodId,
        methodName: preparationMethods.name,
        methodSlug: preparationMethods.slug,
        steps: dishPreparations.steps,
        durationMinutes: dishPreparations.durationMinutes,
        difficulty: dishPreparations.difficulty,
        sequenceOrder: dishPreparations.sequenceOrder,
      })
      .from(dishPreparations)
      .innerJoin(
        preparationMethods,
        eq(dishPreparations.methodId, preparationMethods.id),
      )
      .where(eq(dishPreparations.dishId, dishRow.id))
      .orderBy(dishPreparations.sequenceOrder);

    // Fetch method translations for the requested language in one shot
    let methodTranslations: Array<{
      methodId: string;
      language: string;
      name: string;
      description: string | null;
    }> = [];
    if (dishPreps.length > 0) {
      const methodIds = dishPreps.map((p) => p.methodId);
      methodTranslations = await db
        .select()
        .from(preparationMethodTranslations)
        .where(
          and(
            inArray(preparationMethodTranslations.methodId, methodIds),
            eq(preparationMethodTranslations.language, language),
          ),
        );
    }
    const methodTranslationById = new Map(
      methodTranslations.map((m) => [m.methodId, m]),
    );

    // Sources / citations: for each citation on this dish, fetch the source.
    const dishCitations = await db
      .select({
        id: citations.id,
        claimText: citations.claimText,
        location: citations.location,
        addedAt: citations.addedAt,
        sourceId: citations.sourceId,
        sourceType: sources.sourceType,
        title: sources.title,
        authors: sources.authors,
        year: sources.year,
        publisher: sources.publisher,
        url: sources.url,
        citationText: sources.citationText,
        language: sources.language,
        reliability: sources.reliability,
      })
      .from(citations)
      .innerJoin(sources, eq(citations.sourceId, sources.id))
      .where(eq(citations.targetId, dishRow.id));

    // Media: gallery + cover image via media_attachments
    const dishMedia = await db
      .select({
        attachmentId: mediaAttachments.id,
        role: mediaAttachments.role,
        position: mediaAttachments.position,
        attachedAt: mediaAttachments.attachedAt,
        mediaId: media.id,
        storageKey: media.storageKey,
        mimeType: media.mimeType,
        byteSize: media.byteSize,
        width: media.width,
        height: media.height,
        altText: media.altText,
        credit: media.credit,
        license: media.license,
        uploadedAt: media.uploadedAt,
      })
      .from(mediaAttachments)
      .innerJoin(media, eq(mediaAttachments.mediaId, media.id))
      .where(eq(mediaAttachments.targetId, dishRow.id))
      .orderBy(mediaAttachments.position);

    // Cover image: prefer role='cover', else first gallery item
    const coverImage =
      dishMedia.find((m) => m.role === 'cover') ??
      dishMedia.find((m) => m.role === 'gallery') ??
      null;

    // Origin geo: entity + lat/lng from PostGIS
    let origin: {
      id: string;
      name: string;
      localName: string | null;
      isoCode: string | null;
      entityType: string;
      lat: number | null;
      lng: number | null;
    } | null = null;
    if (dishRow.originGeoId) {
      const geo = await db
        .select()
        .from(geoEntities)
        .where(eq(geoEntities.id, dishRow.originGeoId))
        .limit(1);
      if (geo[0]) {
        const latLng = await extractLatLng('dishes', 'origin_location', dishRow.id);
        origin = {
          id: geo[0].id,
          name: geo[0].name,
          localName: geo[0].localName,
          isoCode: geo[0].isoCode,
          entityType: geo[0].entityType,
          lat: latLng?.lat ?? null,
          lng: latLng?.lng ?? null,
        };
      }
    } else if (dishRow.originLocation) {
      // Geometry might exist even without an entity FK (e.g. hand-pinned dish)
      const latLng = await extractLatLng('dishes', 'origin_location', dishRow.id);
      if (latLng) {
        origin = {
          id: '',
          name: '',
          localName: null,
          isoCode: null,
          entityType: 'point',
          lat: latLng.lat,
          lng: latLng.lng,
        };
      }
    }

    // Editors: createdBy + lastEditedBy → user objects (denormalised for the page)
    // Note: the domain `users` table (Gustale's plural) doesn't have an `image`
    // column — that's only on better-auth's `user` (singular). We just expose
    // the identity columns we have.
    const editorIds = [dishRow.createdBy, dishRow.lastEditedBy].filter(
      (v): v is string => v != null,
    );
    let editors: Array<{
      id: string;
      displayName: string;
      role: string;
    }> = [];
    if (editorIds.length > 0) {
      const editorRows = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          role: users.role,
        })
        .from(users)
        .where(inArray(users.id, editorIds));
      editors = editorRows;
    }
    const createdBy =
      editors.find((u) => u.id === dishRow.createdBy) ?? null;
    const lastEditedBy =
      editors.find((u) => u.id === dishRow.lastEditedBy) ?? null;

    return {
      dish: {
        ...dishRow,
        name: translation?.name ?? dishRow.canonicalName,
        description: translation?.description ?? dishRow.shortDescription,
        createdBy,
        lastEditedBy,
      },
      origin,
      variants,
      ingredients: dishIngs,
      categories: dishCats,
      preparations: dishPreps.map((p) => ({
        id: p.id,
        methodId: p.methodId,
        methodSlug: p.methodSlug,
        methodName:
          methodTranslationById.get(p.methodId)?.name ?? p.methodName,
        steps: p.steps,
        durationMinutes: p.durationMinutes,
        difficulty: p.difficulty,
        sequenceOrder: p.sequenceOrder,
      })),
      sources: dishCitations,
      media: dishMedia,
      coverImage,
      availableLanguages: translations.map((t) => t.language),
    };
  });

  // Search by origin (geo proximity) — for the globe
  app.get('/api/dishes-by-region', async (request, reply) => {
    const schema = z.object({
      bbox: z.string().regex(/^--?\\d+(\\.\\d+)?,-?\\d+(\\.\\d+)?,-?\\d+(\\.\\d+)?,-?\\d+(\\.\\d+)?$/),
      language: z.string().length(2).default('en'),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    });
    const params = schema.parse(request.query);
    const [minLng, minLat, maxLng, maxLat] = params.bbox.split(',').map(Number);

    const result = await db.execute(sql`
      SELECT
        d.id, d.slug, d.canonical_name, d.short_description,
        d.origin_location,
        ST_Y(d.origin_location::geometry) AS lat,
        ST_X(d.origin_location::geometry) AS lng
      FROM dishes d
      WHERE d.status = 'published'
        AND d.origin_location IS NOT NULL
        AND d.origin_location && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
      LIMIT ${params.limit}
    `);

    return { dishes: result, count: (result as any[]).length };
  });

  // ─── Admin write endpoints ──────────────────────────────────────────────────

  /**
   * Admin key check. Set ADMIN_KEY env var on the VPS and pass
   * `X-Admin-Key: <value>` header on all admin requests.
   * Returns true if authorized, false if missing/wrong.
   */
  function isAdminRequest(req: { headers: Record<string, unknown> }): boolean {
    // ADMIN_KEY is set as an env var on the VPS; falls back to empty string.
    const expected = process.env.ADMIN_KEY ?? '';
    if (!expected) return false; // no key configured = all requests denied
    const provided = req.headers['x-admin-key'];
    if (typeof provided !== 'string') return false;
    // Constant-time comparison to prevent timing attacks
    if (provided.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  }

  // ─── PUT /api/dishes/:slug ──────────────────────────────────────────────────

  const ingredientInputSchema = z.object({
    ingredientId: z.string().uuid(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
    isOptional: z.boolean().default(false),
    preparationNote: z.string().optional(),
    position: z.number().int().default(0),
  });

  const preparationInputSchema = z.object({
    methodId: z.string().uuid(),
    steps: z.string().optional(),
    durationMinutes: z.number().int().optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    sequenceOrder: z.number().int().default(0),
  });

  const categoryInputSchema = z.object({
    categoryId: z.string().uuid(),
    isPrimary: z.boolean().default(false),
  });

  const updateDishSchema = z.object({
    canonicalName: z.string().min(1).max(500).optional(),
    shortDescription: z.string().max(2000).optional(),
    longDescription: z.string().optional(),
    originGeoId: z.string().uuid().nullable().optional(),
    originDateEarliest: z.number().int().nullable().optional(),
    originDateLatest: z.number().int().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    ingredients: z.array(ingredientInputSchema).optional(),
    preparations: z.array(preparationInputSchema).optional(),
    categories: z.array(categoryInputSchema).optional(),
  });

  app.put('/api/dishes/:slug', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Missing or invalid X-Admin-Key' });
    }

    const { slug } = slugParamSchema.parse(request.params);
    const body = updateDishSchema.parse(request.body);

    // Find dish
    const existing = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);

    if (existing.length === 0) {
      return reply.status(404).send({ error: 'not_found', message: `No dish with slug "${slug}"` });
    }
    const dishId = existing[0]!.id;

    // Build update object for the dish table
    type DishUpdate = {
      canonicalName?: string;
      shortDescription?: string | null;
      longDescription?: string | null;
      originGeoId?: string | null;
      originDateEarliest?: number | null;
      originDateLatest?: number | null;
      status?: 'draft' | 'published' | 'archived';
      updatedAt?: Date;
    };
    const dishUpdate: DishUpdate = {};
    if (body.canonicalName !== undefined) dishUpdate.canonicalName = body.canonicalName;
    if (body.shortDescription !== undefined) dishUpdate.shortDescription = body.shortDescription ?? null;
    if (body.longDescription !== undefined) dishUpdate.longDescription = body.longDescription ?? null;
    if (body.originGeoId !== undefined) dishUpdate.originGeoId = body.originGeoId;
    if (body.originDateEarliest !== undefined) dishUpdate.originDateEarliest = body.originDateEarliest;
    if (body.originDateLatest !== undefined) dishUpdate.originDateLatest = body.originDateLatest;
    if (body.status !== undefined) dishUpdate.status = body.status;
    dishUpdate.updatedAt = new Date();

    // Update dish
    if (Object.keys(dishUpdate).length > 1) { // >1 because updatedAt is always set
      await db.update(dishes).set(dishUpdate).where(eq(dishes.id, dishId));
    }

    // Replace ingredients if provided
    if (body.ingredients !== undefined) {
      await db.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId));
      if (body.ingredients.length > 0) {
        await db.insert(dishIngredients).values(
          body.ingredients.map((ing) => ({
            dishId,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            isOptional: ing.isOptional ?? false,
            preparationNote: ing.preparationNote ?? null,
            position: ing.position ?? 0,
          })),
        );
      }
    }

    // Replace preparations if provided
    if (body.preparations !== undefined) {
      await db.delete(dishPreparations).where(eq(dishPreparations.dishId, dishId));
      if (body.preparations.length > 0) {
        await db.insert(dishPreparations).values(
          body.preparations.map((prep) => ({
            dishId,
            methodId: prep.methodId,
            steps: prep.steps ?? null,
            durationMinutes: prep.durationMinutes ?? null,
            difficulty: prep.difficulty ?? null,
            sequenceOrder: prep.sequenceOrder ?? 0,
          })),
        );
      }
    }

    // Replace categories if provided
    if (body.categories !== undefined) {
      await db.delete(dishCategories).where(eq(dishCategories.dishId, dishId));
      if (body.categories.length > 0) {
        await db.insert(dishCategories).values(
          body.categories.map((cat) => ({
            dishId,
            categoryId: cat.categoryId,
            isPrimary: cat.isPrimary ?? false,
          })),
        );
      }
    }

    // Return the updated dish
    const updated = await db
      .select()
      .from(dishes)
      .where(eq(dishes.id, dishId))
      .limit(1);

    return { dish: updated[0], ok: true };
  });

  // ─── GET /api/admin/lookups — all data needed to populate admin forms ────────

  app.get('/api/admin/lookups', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Missing or invalid X-Admin-Key' });
    }

    const [allIngredients, allCategories, allMethods] = await Promise.all([
      db.select({
        id: ingredients.id,
        name: ingredients.canonicalName,
        slug: ingredients.slug,
        category: ingredients.category,
      }).from(ingredients).orderBy(ingredients.canonicalName),

      db.select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      }).from(categories).orderBy(categories.name),

      db.select({
        id: preparationMethods.id,
        name: preparationMethods.name,
        slug: preparationMethods.slug,
      }).from(preparationMethods).orderBy(preparationMethods.name),
    ]);

    const allCountries = await db
      .select({
        id: geoEntities.id,
        name: geoEntities.name,
        isoCode: geoEntities.isoCode,
        entityType: geoEntities.entityType,
      })
      .from(geoEntities)
      .where(eq(geoEntities.entityType, 'country'))
      .orderBy(geoEntities.name);

    return {
      ingredients: allIngredients,
      categories: allCategories,
      preparationMethods: allMethods,
      countries: allCountries,
    };
  });

  // ─── GET /api/admin/dishes — paginated dish list for admin UI ──────────────

  app.get('/api/admin/dishes', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Missing or invalid X-Admin-Key' });
    }

    const params = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      q: z.string().optional(),
    }).parse(request.query);

    const whereClauses: SQL[] = [];
    if (params.status) whereClauses.push(eq(dishes.status, params.status));
    if (params.q) {
      whereClauses.push(
        or(
          ilike(dishes.canonicalName, `%${params.q}%`),
          ilike(dishes.slug, `%${params.q}%`),
        )!,
      );
    }

    const [dishRows, countRows] = await Promise.all([
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
        })
        .from(dishes)
        .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
        .orderBy(desc(dishes.updatedAt))
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(dishes)
        .where(whereClauses.length > 0 ? and(...whereClauses) : undefined),
    ]);

    // Resolve country names for the list
    const geoIds = [...new Set(dishRows.map((d) => d.originGeoId).filter((v): v is string => !!v))];
    const geoRows = geoIds.length > 0
      ? await db.select({ id: geoEntities.id, name: geoEntities.name })
          .from(geoEntities).where(inArray(geoEntities.id, geoIds))
      : [];
    const geoMap = new Map(geoRows.map((g) => [g.id, g.name]));

    return {
      dishes: dishRows.map((d) => ({
        ...d,
        originName: d.originGeoId ? (geoMap.get(d.originGeoId) ?? null) : null,
      })),
      total: Number(countRows[0]?.count ?? 0),
      limit: params.limit,
      offset: params.offset,
    };
  });

  // ─── GET /api/admin/dishes/:slug — full dish detail for admin editor ─────────

  app.get('/api/admin/dishes/:slug', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Missing or invalid X-Admin-Key' });
    }

    const { slug } = slugParamSchema.parse(request.params);

    const dishRows = await db
      .select()
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);

    if (dishRows.length === 0) {
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
    }
    const dishRow = dishRows[0]!;

    // Ingredients with full ingredient details
    const dishIngs = await db
      .select({
        ingredientId: dishIngredients.ingredientId,
        position: dishIngredients.position,
        quantity: dishIngredients.quantity,
        unit: dishIngredients.unit,
        isOptional: dishIngredients.isOptional,
        preparationNote: dishIngredients.preparationNote,
        name: ingredients.canonicalName,
        slug: ingredients.slug,
      })
      .from(dishIngredients)
      .innerJoin(ingredients, eq(dishIngredients.ingredientId, ingredients.id))
      .where(eq(dishIngredients.dishId, dishRow.id))
      .orderBy(dishIngredients.position);

    // Categories
    const dishCats = await db
      .select({
        categoryId: dishCategories.categoryId,
        name: categories.name,
        slug: categories.slug,
        isPrimary: dishCategories.isPrimary,
      })
      .from(dishCategories)
      .innerJoin(categories, eq(dishCategories.categoryId, categories.id))
      .where(eq(dishCategories.dishId, dishRow.id));

    // Preparations with method details
    const dishPreps = await db
      .select({
        id: dishPreparations.id,
        methodId: dishPreparations.methodId,
        methodName: preparationMethods.name,
        methodSlug: preparationMethods.slug,
        steps: dishPreparations.steps,
        durationMinutes: dishPreparations.durationMinutes,
        difficulty: dishPreparations.difficulty,
        sequenceOrder: dishPreparations.sequenceOrder,
      })
      .from(dishPreparations)
      .innerJoin(preparationMethods, eq(dishPreparations.methodId, preparationMethods.id))
      .where(eq(dishPreparations.dishId, dishRow.id))
      .orderBy(dishPreparations.sequenceOrder);

    // Origin geo
    let originName = null;
    if (dishRow.originGeoId) {
      const geo = await db
        .select({ name: geoEntities.name })
        .from(geoEntities)
        .where(eq(geoEntities.id, dishRow.originGeoId))
        .limit(1);
      originName = geo[0]?.name ?? null;
    }

    return {
      dish: {
        ...dishRow,
        originName,
      },
      ingredients: dishIngs,
      categories: dishCats,
      preparations: dishPreps,
    };
  });
}
