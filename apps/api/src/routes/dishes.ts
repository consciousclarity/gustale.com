import { httpError } from '../errors.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  eq,
  and,
  asc,
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
  dishTags,
  dishRelations,
  tags,
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
  country: z.string().max(100).optional(),    // origin country name
  cuisine: z.string().max(100).optional(),     // cuisine category (Korean cuisine, Italian cuisine…)
  type: z.string().max(100).optional(),         // dish-type category (Noodle soup, Stew, Pasta…)
  ingredient: z.string().max(100).optional(),
  technique: z.string().max(100).optional(),
  region: z.string().max(100).optional(),     // legacy alias for country
  category: z.string().max(100).optional(),    // legacy alias for cuisine
  period: z.string().max(100).optional(),       // historical era e.g. 1920-1950
  family: z.string().max(100).optional(),       // kind='family' category slug (Dumplings, Noodle soups…)
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

    if (params.country) {
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = dishes.origin_geo_id AND g.name ILIKE ${'%' + params.country + '%'})`
      );
    }

    if (params.cuisine) {
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_categories dc2 JOIN categories c2 ON c2.id = dc2.category_id WHERE dc2.dish_id = dishes.id AND c2.name ILIKE ${'%' + params.cuisine + '%'})`
      );
    }

    if (params.type) {
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_categories dc3 JOIN categories c3 ON c3.id = dc3.category_id WHERE dc3.dish_id = dishes.id AND c3.name ILIKE ${'%' + params.type + '%'})`
      );
    }

    if (params.ingredient) {
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id WHERE di.dish_id = dishes.id AND i.canonical_name ILIKE ${'%' + params.ingredient + '%'})`
      );
    }

    if (params.technique) {
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_preparations dp2 JOIN preparation_methods pm2 ON pm2.id = dp2.method_id WHERE dp2.dish_id = dishes.id AND pm2.slug = ${params.technique})`
      );
    }

    if (params.period) {
      // Accept "1920", "1920-1950", "1920_1950" → match origin_date_earliest <= latest_year AND origin_date_latest >= earliest_year
      const parts = params.period.replace(/_/g, '-').split('-').filter(Boolean);
      const earliest = parts[0] ? parseInt(parts[0]) : null;
      const latest = parts[1] ? parseInt(parts[1]) : earliest;
      if (earliest !== null) {
        whereClauses.push(
          sql`dishes.origin_date_latest >= ${earliest}`
        );
      }
      if (latest !== null) {
        whereClauses.push(
          sql`dishes.origin_date_earliest <= ${latest}`
        );
      }
    }

    if (params.region) {
      // Legacy alias for country — same ILIKE on geo_entities.name
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = dishes.origin_geo_id AND g.name ILIKE ${'%' + params.region + '%'})`
      );
    }

    if (params.category) {
      // Match by category slug (cuisine or dish-type) via the join table.
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_categories dc JOIN categories c ON c.id = dc.category_id WHERE dc.dish_id = dishes.id AND c.slug = ${params.category})`
      );
    }

    if (params.family) {
      // Match by kind='family' category slug (Dumplings, Noodle soups…)
      whereClauses.push(
        sql`EXISTS (SELECT 1 FROM dish_categories dc4 JOIN categories c4 ON c4.id = dc4.category_id WHERE dc4.dish_id = dishes.id AND c4.slug = ${params.family} AND c4.kind = 'family')`
      );
    }

    // Build dynamic WHERE conditions as raw SQL fragments.
    const whereFragments: (SQL | undefined)[] = [sql`d.status = ${params.status}`];
    if (params.q) {
      whereFragments.push(sql`d.canonical_name ILIKE ${'%' + params.q + '%'}`);
    }
    if (params.country) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = d.origin_geo_id AND g.name ILIKE ${'%' + params.country + '%'})`);
    }
    if (params.cuisine) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_categories dc2 JOIN categories c2 ON c2.id = dc2.category_id WHERE dc2.dish_id = d.id AND c2.name ILIKE ${'%' + params.cuisine + '%'})`);
    }
    if (params.type) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_categories dc3 JOIN categories c3 ON c3.id = dc3.category_id WHERE dc3.dish_id = d.id AND c3.name ILIKE ${'%' + params.type + '%'})`);
    }
    if (params.ingredient) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id WHERE di.dish_id = d.id AND i.canonical_name ILIKE ${'%' + params.ingredient + '%'})`);
    }
    if (params.technique) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_preparations dp2 JOIN preparation_methods pm2 ON pm2.id = dp2.method_id WHERE dp2.dish_id = d.id AND pm2.slug = ${params.technique})`);
    }
    if (params.region) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = d.origin_geo_id AND g.name ILIKE ${'%' + params.region + '%'})`);
    }
    if (params.category) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_categories dc JOIN categories c ON c.id = dc.category_id WHERE dc.dish_id = d.id AND c.slug = ${params.category})`);
    }
    if (params.family) {
      whereFragments.push(sql`EXISTS (SELECT 1 FROM dish_categories dc4 JOIN categories c4 ON c4.id = dc4.category_id WHERE dc4.dish_id = d.id AND c4.slug = ${params.family} AND c4.kind = 'family')`);
    }
    if (params.period) {
      const parts = params.period.replace(/_/g, '-').split('-').filter(Boolean);
      const earliest = parts[0] ? parseInt(parts[0]) : null;
      const latest = parts[1] ? parseInt(parts[1]) : earliest;
      if (earliest !== null) whereFragments.push(sql`d.origin_date_latest >= ${earliest}`);
      if (latest !== null) whereFragments.push(sql`d.origin_date_earliest <= ${latest}`);
    }
    const whereClause = whereFragments.filter((f): f is SQL => f !== undefined);

    // Use raw SQL to avoid Drizzle's postgres-js prepared-statement incompatibility
    // with scalar-subquery columns in .select(). All values are parameterized via
    // ${} so there is no SQL injection risk.
    const rows = (await db.execute(sql`
      SELECT
        d.id,
        d.slug,
        d.canonical_name      AS canonical_name,
        d.short_description   AS short_description,
        d.origin_geo_id        AS origin_geo_id,
        g.name                AS origin_name,
        d.status,
        d.view_count          AS view_count,
        d.updated_at           AS updated_at,
        fam.slug              AS family_slug,
        fam.name              AS family_name,
        meth.slug             AS method_slug,
        meth.name             AS method_name
      FROM dishes d
      LEFT JOIN geo_entities g ON g.id = d.origin_geo_id
      LEFT JOIN LATERAL (
        SELECT c.slug, c.name
        FROM dish_categories dc
        JOIN categories c ON c.id = dc.category_id
        WHERE dc.dish_id = d.id
          AND c.kind = 'dish-type'
        ORDER BY dc.is_primary DESC
        LIMIT 1
      ) fam ON true
      LEFT JOIN LATERAL (
        SELECT pm.slug, pm.name
        FROM dish_preparations dp
        JOIN preparation_methods pm ON pm.id = dp.method_id
        WHERE dp.dish_id = d.id
        ORDER BY dp.sequence ASC
        LIMIT 1
      ) meth ON true
      WHERE ${whereClause.length > 1 ? sql.join(whereClause, sql` AND `) : whereClause[0]}
      ORDER BY d.view_count DESC, d.canonical_name ASC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `)) as {
      id: string;
      slug: string;
      canonical_name: string;
      short_description: string | null;
      origin_geo_id: string | null;
      origin_name: string | null;
      status: string;
      view_count: number;
      updated_at: Date;
      family_slug: string | null;
      family_name: string | null;
      method_slug: string | null;
      method_name: string | null;
    }[];

    const result = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      canonicalName: row.canonical_name,
      shortDescription: row.short_description,
      originGeoId: row.origin_geo_id,
      originName: row.origin_name,
      status: row.status as 'draft' | 'published' | 'archived',
      viewCount: row.view_count,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as Date).toISOString(),
      familySlug: row.family_slug,
      familyName: row.family_name,
      methodSlug: row.method_slug,
      methodName: row.method_name,
    }));

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
      throw httpError(404, 'not_found', 'Dish not found');
    }

    const dishRow = dish[0]!;

    // A1: drafts (and archived) are not visible to anonymous reads.
    // Authenticated moderators+ would query a different route; out of scope here.
    if (dishRow.status !== 'published') {
      throw httpError(404, 'not_found', 'Dish not found');
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

    // Tags
    const dishTagRows = await db
      .select({
        tagId: dishTags.tagId,
        name: tags.name,
        slug: tags.slug,
      })
      .from(dishTags)
      .innerJoin(tags, eq(dishTags.tagId, tags.id))
      .where(eq(dishTags.dishId, dishRow.id));

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
      tags: dishTagRows,
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
      bbox: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
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

  // ─── Related dishes (the food-genealogy network) ─────────────────────
  // GET /api/dishes/:slug/relations
  //
  // Returns the curated relations for a dish, grouped by relation_type
  // and ordered by strength descending. Each entry includes the related
  // dish's slug + name + cuisine slug + country name so the UI can render
  // a card without a second request.
  //
  // Anonymous-readable. Only published dishes appear on the other end of
  // the edge (drafts/archived are filtered out so we don't leak WIP).
  app.get('/api/dishes/:slug/relations', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);

    // 1) Resolve the source dish → id.
    const src = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (src.length === 0 || !src[0]) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const sourceId = src[0].id;

    // 2) Pull all outgoing relations + the related dish summary + its
    //    cuisine (primary category) + country (origin geo).
    //
    // We LEFT JOIN categories and geo_entities to surface the related
    // dish's cuisine/region in one round trip. Filtering on
    // `dishes.status = 'published'` keeps unpublished siblings out.
    const rows = await db
      .select({
        relationId: dishRelations.id,
        relationType: dishRelations.relationType,
        reason: dishRelations.reason,
        strength: dishRelations.strength,
        toDishId: dishes.id,
        toDishSlug: dishes.slug,
        toDishName: dishes.canonicalName,
        toDishShortDescription: dishes.shortDescription,
        toDishOriginName: geoEntities.name,
        toDishOriginIso: geoEntities.isoCode,
        toCuisineSlug: categories.slug,
        toCuisineName: categories.name,
      })
      .from(dishRelations)
      .innerJoin(dishes, eq(dishRelations.toDishId, dishes.id))
      .leftJoin(geoEntities, eq(dishes.originGeoId, geoEntities.id))
      // Only the primary cuisine category — secondary dish-types would
      // muddy the "what cuisine is this?" answer the UI needs.
      .leftJoin(
        dishCategories,
        and(
          eq(dishCategories.dishId, dishes.id),
          eq(dishCategories.isPrimary, true),
        ),
      )
      .leftJoin(categories, eq(dishCategories.categoryId, categories.id))
      .where(
        and(
          eq(dishRelations.fromDishId, sourceId),
          eq(dishes.status, 'published'),
        ),
      )
      .orderBy(desc(dishRelations.strength), asc(dishes.canonicalName));

    // 3) Group by relation_type for the UI. Within each group, sort
    //    is already correct (by strength desc, then name asc).
    type RelatedRow = {
      slug: string;
      name: string;
      shortDescription: string | null;
      cuisineSlug: string | null;
      cuisineName: string | null;
      countryName: string | null;
      isoCode: string | null;
      relationId: string;
      relationType: string;
      reason: string | null;
      strength: number;
    };

    const grouped: Record<string, RelatedRow[]> = {};
    for (const r of rows) {
      const bucket = grouped[r.relationType] ?? [];
      bucket.push({
        slug: r.toDishSlug,
        name: r.toDishName,
        shortDescription: r.toDishShortDescription,
        cuisineSlug: r.toCuisineSlug,
        cuisineName: r.toCuisineName,
        countryName: r.toDishOriginName,
        isoCode: r.toDishOriginIso,
        relationId: r.relationId,
        relationType: r.relationType,
        reason: r.reason,
        strength: r.strength,
      });
      grouped[r.relationType] = bucket;
    }

    return {
      sourceSlug: slug,
      totalRelations: rows.length,
      relationsByType: grouped,
    };
  });
}
