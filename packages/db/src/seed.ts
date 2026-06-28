/**
 * Gustale — seed script
 *
 * Seeds a complete test dish (Moussaka) with all relations so the API
 * and frontend have something to render, PLUS a curated encyclopedia of
 * ~30 iconic world dishes sourced from Wikipedia. Idempotent: re-running
 * with the same slug will skip the dish insert but refresh view_count.
 *
 * Usage:  pnpm --filter @gustale/db run seed
 *   or:   DATABASE_URL=... tsx packages/db/src/seed.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import { DISHES, CUISINE_CATEGORIES, DISH_TYPE_CATEGORIES, DISH_RELATIONS, LINEAGE_METHODS, DISH_LINEAGES } from './seed-data.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(url, { max: 1 });

// Drizzle's `drizzle({ schema })` chokes on non-table exports (enums,
// type-only exports). Filter down to actual pgTable objects.
const DRIZZLE_BASE_NAME = Symbol.for('drizzle:BaseName');
const isDrizzleTable = (v: unknown): v is { readonly [DRIZZLE_BASE_NAME]: string } =>
  !!v && typeof v === 'object' && DRIZZLE_BASE_NAME in v;
const schemaTablesOnly = Object.fromEntries(
  Object.entries(schema).filter(([, v]) => isDrizzleTable(v)),
);

const db = drizzle(client, { schema: schemaTablesOnly });

async function main(): Promise<void> {
  // 1. Migrate first (safe to re-run)
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete');

  // 2. Seed user (the "creator" and "last editor")
  const userId = '00000000-0000-0000-0000-000000000001';
  await db
    .insert(schema.users)
    .values({
      id: userId,
      email: 'alex@example.com',
      displayName: 'Alejandro Aguilar',
      role: 'admin',
    })
    .onConflictDoNothing();

  // 3. Categories
  const moussakaCat = 'moussaka';
  const greekCat = 'greek-cuisine';
  await db
    .insert(schema.categories)
    .values([
      { slug: moussakaCat, name: 'Moussaka', description: 'Layered eggplant and meat dishes' },
      { slug: greekCat, name: 'Greek cuisine', description: 'Cuisine of Greece' },
    ])
    .onConflictDoNothing();

  // 4. Preparation methods — the 16 lineage methods. These MUST stay 1:1
  //    with the LINEAGE_LABELS map in apps/web/src/pages/lineages.astro;
  //    the /lineages page groups dishes by their first preparation method.
  await db
    .insert(schema.preparationMethods)
    .values(LINEAGE_METHODS)
    .onConflictDoNothing();

  // 5. Geo entity: Greece
  const greeceId = '00000000-0000-0000-0000-000000000010';
  await db
    .insert(schema.geoEntities)
    .values({
      id: greeceId,
      name: 'Greece',
      isoCode: 'GR',
      entityType: 'country',
    })
    .onConflictDoNothing();

  // 6. Dish: Moussaka (the canonical Greek one)
  const moussakaSlug = 'moussaka-greek';
  const existing = await db
    .select({ id: schema.dishes.id })
    .from(schema.dishes)
    .where(eq(schema.dishes.slug, moussakaSlug))
    .limit(1);

  let dishId: string;
  if (existing.length > 0) {
    dishId = existing[0]!.id;
    console.log(`Dish "${moussakaSlug}" already exists (${dishId}), skipping inserts`);
  } else {
    // Insert the dish with origin location as a PostGIS geometry literal
    const inserted = await db
      .insert(schema.dishes)
      .values({
        slug: moussakaSlug,
        canonicalName: 'Moussaka',
        shortDescription:
          'A layered casserole of eggplant, minced meat, and béchamel sauce, baked until golden. The national dish of Greece.',
        longDescription:
          'Greek moussaka combines fried or roasted eggplant layers with a spiced meat sauce (lamb or beef) and a thick, cheese-topped béchamel. The dish is baked until the top turns golden brown. Regional variants exist across the Balkans, Levant, and Egypt.',
        status: 'published',
        originGeoId: greeceId,
        originDateEarliest: 1920,
        originDateLatest: 1950,
        createdBy: userId,
        lastEditedBy: userId,
      })
      .returning({ id: schema.dishes.id });

    dishId = inserted[0]!.id;
    console.log(`Inserted dish ${moussakaSlug} (${dishId})`);

    // Set origin_location via raw SQL (Drizzle's geometry custom type round-trips as string)
    await db.execute(
      sql`UPDATE dishes SET origin_location = ST_SetSRID(ST_MakePoint(23.7275, 37.9838), 4326) WHERE id = ${dishId}::uuid`,
    );

    // 7. Translations
    await db.insert(schema.dishTranslations).values({
      dishId,
      language: 'en',
      name: 'Moussaka',
      description: 'The Greek national casserole of eggplant, meat, and béchamel.',
    });

    // 8. Categories link
    const cats = await db
      .select({ id: schema.categories.id, slug: schema.categories.slug })
      .from(schema.categories)
      .where(sql`${schema.categories.slug} IN (${moussakaCat}, ${greekCat})`);
    if (cats.length > 0) {
      await db.insert(schema.dishCategories).values(
        cats.map((c) => ({ dishId, categoryId: c.id, isPrimary: c.slug === moussakaCat })),
      );
    }

    // 9. Variants
    await db.insert(schema.dishVariants).values({
      parentDishId: dishId,
      name: 'Turkish Moussaka (Musakka)',
      slug: 'musakka-turkish',
      description:
        'A Turkish variant, often lighter, sometimes without béchamel, using green peppers and tomatoes.',
      status: 'published',
    });

    // 10. Ingredients
    const ingredientSlugs = ['eggplant', 'lamb-mince', 'tomato', 'bechamel-sauce'];
    const ingredientNames: Record<string, string> = {
      eggplant: 'Eggplant',
      'lamb-mince': 'Lamb, minced',
      tomato: 'Tomato',
      'bechamel-sauce': 'Béchamel sauce',
    };
    const ingredients = await Promise.all(
      ingredientSlugs.map(async (slug) => {
        const rows = await db
          .select({ id: schema.ingredients.id })
          .from(schema.ingredients)
          .where(eq(schema.ingredients.slug, slug))
          .limit(1);
        if (rows[0]) return rows[0].id;
        const inserted = await db
          .insert(schema.ingredients)
          .values({
            slug,
            canonicalName: ingredientNames[slug]!,
            status: 'published',
            createdBy: userId,
          })
          .returning({ id: schema.ingredients.id });
        return inserted[0]!.id;
      }),
    );

    await db.insert(schema.dishIngredients).values([
      { dishId, ingredientId: ingredients[0]!, position: 0, quantity: '4', unit: 'medium' },
      { dishId, ingredientId: ingredients[1]!, position: 1, quantity: '500', unit: 'g' },
      { dishId, ingredientId: ingredients[2]!, position: 2, quantity: '400', unit: 'g' },
      { dishId, ingredientId: ingredients[3]!, position: 3, quantity: '500', unit: 'ml' },
    ]);

    // 11. Preparation — Moussaka's lineage is "fried & topped" (fried
    //     eggplant layered with meat sauce, topped with béchamel, baked).
    //     One row at sequence 0 → drives methodSlug on the list endpoint.
    const friedTopped = await db
      .select({ id: schema.preparationMethods.id })
      .from(schema.preparationMethods)
      .where(eq(schema.preparationMethods.slug, 'fried-and-topped'))
      .limit(1);
    if (friedTopped[0]) {
      await db.insert(schema.dishPreparations).values({
        dishId,
        methodId: friedTopped[0].id,
        sequenceOrder: 0,
        durationMinutes: 90,
        difficulty: 3,
        steps:
          'Brown the minced lamb with onion, garlic, cinnamon, and allspice; simmer until thick. Fry the eggplant slices. Layer eggplant and meat sauce in a baking dish, top with béchamel and kefalotyri, and bake at 180°C until golden.',
      });
    }

    // 12. Media (one cover image)
    const mediaId = '00000000-0000-0000-0000-000000000100';
    await db
      .insert(schema.media)
      .values({
        id: mediaId,
        storageKey: 'dishes/moussaka-greek/cover.jpg',
        mimeType: 'image/jpeg',
        byteSize: 245678,
        width: 1600,
        height: 1067,
        altText: 'A Greek moussaka fresh from the oven, golden béchamel on top.',
        credit: 'Photo by test seed',
        license: 'CC-BY-SA-4.0',
        uploadedBy: userId,
      })
      .onConflictDoNothing();
    await db
      .insert(schema.mediaAttachments)
      .values({
        mediaId,
        targetType: 'dish',
        targetId: dishId,
        role: 'cover',
        position: 0,
      })
      .onConflictDoNothing();

    // 13. Source + citation (Wikipedia: Moussaka)
    const sourceId = '00000000-0000-0000-0000-000000000200';
    await db
      .insert(schema.sources)
      .values({
        id: sourceId,
        sourceType: 'web',
        title: 'Moussaka',
        authors: ['Wikipedia contributors'],
        year: 2024,
        publisher: 'Wikipedia, The Free Encyclopedia',
        url: 'https://en.wikipedia.org/wiki/Moussaka',
        citationText: 'Wikipedia. (2024). Moussaka. Retrieved from https://en.wikipedia.org/wiki/Moussaka',
        language: 'en',
        reliability: 'secondary',
        createdBy: userId,
      })
      .onConflictDoNothing();
    await db
      .insert(schema.citations)
      .values({
        sourceId,
        targetType: 'dish',
        targetId: dishId,
        claimText: 'Moussaka is a dish popular in Greece, the Balkans, and the Levant.',
        location: 'History section',
        addedBy: userId,
      })
      .onConflictDoNothing();
  }

  // ─── Encyclopedia bulk seed ────────────────────────────────────────────
  await seedEncyclopedia(db, userId);

  // ─── Dish relations (the food-genealogy network) ──────────────────────
  await seedDishRelations(db);

  console.log(`\nSeed complete. Test dish: ${moussakaSlug}`);
  console.log(`\nTry: curl http://localhost:4000/api/dishes/${moussakaSlug} | jq .`);
  await client.end();
}

/**
 * Seed the curated encyclopedia of ~30 dishes with proper origin geometry,
 * cuisine categories, dish-type categories, and per-dish Wikipedia citations.
 *
 * Idempotent: existing slugs are skipped (just like the Moussaka block).
 */
async function seedEncyclopedia(
  db: ReturnType<typeof drizzle>,
  userId: string,
): Promise<void> {
  // 1. Categories (cuisine + dish-type). onConflictDoNothing keeps re-runs safe.
  //    Note: the existing Moussaka seed already inserts "greek-cuisine" and
  //    "moussaka", so we filter those out to avoid noisy conflict logs.
  const existingCatSlugs = new Set(
    (await db.select({ slug: schema.categories.slug }).from(schema.categories)).map(
      (r) => r.slug,
    ),
  );
  const newCuisines = CUISINE_CATEGORIES.filter((c) => !existingCatSlugs.has(c.slug));
  const newDishTypes = DISH_TYPE_CATEGORIES.filter((c) => !existingCatSlugs.has(c.slug));
  if (newCuisines.length + newDishTypes.length > 0) {
    await db
      .insert(schema.categories)
      .values([...newCuisines, ...newDishTypes])
      .onConflictDoNothing();
    console.log(`  + ${newCuisines.length} cuisine + ${newDishTypes.length} dish-type categories`);
  }

  // 2. Geo entities — one per country. Idempotent via onConflictDoNothing.
  const newCountries = Array.from(
    new Map(DISHES.map((d) => [d.isoCode, { name: d.countryName, isoCode: d.isoCode }])).values(),
  );
  // Only insert countries we haven't seen — query first to avoid noise.
  const existingCountries = new Set(
    (await db.select({ isoCode: schema.geoEntities.isoCode }).from(schema.geoEntities)).map(
      (r) => r.isoCode,
    ),
  );
  const toInsert = newCountries.filter((c) => !existingCountries.has(c.isoCode));
  if (toInsert.length > 0) {
    await db
      .insert(schema.geoEntities)
      .values(
        toInsert.map((c) => ({
          name: c.name,
          isoCode: c.isoCode,
          entityType: 'country' as const,
        })),
      )
      .onConflictDoNothing();
    console.log(`  + ${toInsert.length} country geo entities`);
  }

  // 3. Build slug → categoryId lookup for all category types (cuisine + dish-type).
  const allCategories = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug })
    .from(schema.categories);
  const catIdBySlug = new Map(allCategories.map((c) => [c.slug, c.id]));

  // 4. Build isoCode → geoEntityId lookup for origin FKs.
  const allGeo = await db
    .select({ id: schema.geoEntities.id, isoCode: schema.geoEntities.isoCode })
    .from(schema.geoEntities);
  const geoIdByIso = new Map(allGeo.map((g) => [g.isoCode, g.id]));

  // 5. Existing dish slugs — skip them on re-run.
  const existingDishSlugs = new Set(
    (await db.select({ slug: schema.dishes.slug }).from(schema.dishes)).map((r) => r.slug),
  );

  // 6. Iterate over curated DISHES, inserting each one with its full citation trail.
  let inserted = 0;
  let skipped = 0;
  for (const d of DISHES) {
    if (existingDishSlugs.has(d.slug)) {
      skipped++;
      continue;
    }

    const countryId = geoIdByIso.get(d.isoCode);
    if (!countryId) {
      console.warn(`  ! skipping ${d.slug}: missing geo entity for ${d.isoCode}`);
      continue;
    }

    // Insert the dish row
    const insertedRows = await db
      .insert(schema.dishes)
      .values({
        slug: d.slug,
        canonicalName: d.canonicalName,
        shortDescription: d.shortDescription,
        longDescription: d.longDescription ?? null,
        status: 'published',
        originGeoId: countryId,
        originDateEarliest: d.originDateEarliest ?? null,
        originDateLatest: d.originDateLatest ?? null,
        createdBy: userId,
        lastEditedBy: userId,
      })
      .returning({ id: schema.dishes.id });
    const dishId = insertedRows[0]!.id;

    // Set origin_location via raw SQL (PostGIS geometry — Drizzle's custom
    // geometry type round-trips as a string, so we use raw SQL for the SET).
    await db.execute(
      sql`UPDATE dishes SET origin_location = ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326) WHERE id = ${dishId}::uuid`,
    );

    // English translation
    await db.insert(schema.dishTranslations).values({
      dishId,
      language: 'en',
      name: d.canonicalName,
      description: d.shortDescription,
    });

    // Category links: 1 cuisine + N dish-types. Use the primary flag on cuisine.
    const categoryLinks: Array<{ dishId: string; categoryId: string; isPrimary: boolean }> = [];

    const cuisineId = catIdBySlug.get(d.cuisineSlug);
    if (cuisineId) {
      categoryLinks.push({ dishId, categoryId: cuisineId, isPrimary: true });
    }

    for (const dishType of d.dishTypes) {
      const typeId = catIdBySlug.get(dishType);
      if (typeId) {
        categoryLinks.push({ dishId, categoryId: typeId, isPrimary: false });
      }
    }

    if (categoryLinks.length > 0) {
      await db.insert(schema.dishCategories).values(categoryLinks).onConflictDoNothing();
    }

    // Wikipedia source + citation — the encyclopedia DNA: every claim has a trail.
    const url = `https://en.wikipedia.org/wiki/${d.wikipediaSlug}`;
    const year = new Date().getFullYear();
    const sourceRows = await db
      .insert(schema.sources)
      .values({
        sourceType: 'web',
        title: d.canonicalName,
        authors: ['Wikipedia contributors'],
        year,
        publisher: 'Wikipedia, The Free Encyclopedia',
        url,
        citationText: `Wikipedia. (${year}). ${d.canonicalName}. Retrieved from ${url}`,
        language: 'en',
        reliability: 'secondary',
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning({ id: schema.sources.id });

    const sourceId = sourceRows[0]?.id ?? (
      await db
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(eq(schema.sources.url, url))
        .limit(1)
    )[0]?.id;

    if (sourceId) {
      await db.insert(schema.citations).values({
        sourceId,
        targetType: 'dish',
        targetId: dishId,
        claimText: d.shortDescription,
        location: 'Lead paragraph',
        addedBy: userId,
      });
    }

    inserted++;
  }

  console.log(`  + ${inserted} new dishes inserted, ${skipped} already existed`);
  console.log(`  Total in encyclopedia: ${DISHES.length} dishes`);

  // 7. Preparations — give every dish its lineage method (one row at
  //    sequence 0) if it doesn't already have one. This is what populates
  //    `methodSlug` on the list endpoint and drives the /lineages page.
  //    Idempotent: dishes that already have a preparation row (e.g. the
  //    Moussaka block above, or a prior run) are skipped.
  const methodIdBySlug = new Map(
    (
      await db
        .select({ id: schema.preparationMethods.id, slug: schema.preparationMethods.slug })
        .from(schema.preparationMethods)
    ).map((m) => [m.slug, m.id]),
  );
  const dishIdBySlug = new Map(
    (await db.select({ id: schema.dishes.id, slug: schema.dishes.slug }).from(schema.dishes)).map(
      (d) => [d.slug, d.id],
    ),
  );
  const dishesWithPrep = new Set(
    (await db.select({ dishId: schema.dishPreparations.dishId }).from(schema.dishPreparations)).map(
      (r) => r.dishId,
    ),
  );
  let prepInserted = 0;
  for (const d of DISHES) {
    const dishId = dishIdBySlug.get(d.slug);
    const lineage = DISH_LINEAGES[d.slug];
    if (!dishId || !lineage || dishesWithPrep.has(dishId)) continue;
    const methodId = methodIdBySlug.get(lineage);
    if (!methodId) {
      console.warn(`  ! ${d.slug}: lineage method "${lineage}" missing from preparation_methods`);
      continue;
    }
    await db.insert(schema.dishPreparations).values({ dishId, methodId, sequenceOrder: 0 });
    prepInserted++;
  }
  console.log(`  + ${prepInserted} dish_preparations (lineage) inserted`);
}

/**
 * Seed the curated dish-relations network.
 *
 * For each entry in DISH_RELATIONS we insert TWO rows: the directed edge
 * (from → to) and the reverse edge (to → from), both with the same reason
 * and strength. The UI looks up relations by dish id from either side so
 * we always see them when navigating from either dish.
 *
 * Skips relations whose slugs reference a dish that doesn't exist (with a
 * warning), so partial seeder runs don't fail loudly.
 *
 * Idempotent: uses onConflictDoNothing on the (from, to, relation_type)
 * unique index. Re-running is a no-op except for any newly-added edges.
 */
async function seedDishRelations(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  // Build slug → dishId lookup for all currently published dishes.
  const allDishes = await db
    .select({ id: schema.dishes.id, slug: schema.dishes.slug })
    .from(schema.dishes);
  const idBySlug = new Map(allDishes.map((d) => [d.slug, d.id]));

  // Collect every directed edge: original + reverse.
  type Edge = { fromDishId: string; toDishId: string; relationType: schema.DishRelationType; reason: string | null; strength: number };
  const edges: Edge[] = [];
  let missing = 0;
  for (const r of DISH_RELATIONS) {
    const fromId = idBySlug.get(r.from);
    const toId = idBySlug.get(r.to);
    if (!fromId || !toId) {
      missing++;
      continue;
    }
    edges.push({
      fromDishId: fromId,
      toDishId: toId,
      relationType: r.relationType,
      reason: r.reason,
      strength: r.strength,
    });
    edges.push({
      fromDishId: toId,
      toDishId: fromId,
      relationType: r.relationType,
      reason: r.reason,
      strength: r.strength,
    });
  }

  if (missing > 0) {
    console.warn(`  ! ${missing} relation entries reference unknown dish slugs (skipped)`);
  }

  // Insert in chunks of 100 to avoid huge single-statement payloads.
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < edges.length; i += CHUNK) {
    const slice = edges.slice(i, i + CHUNK);
    const res = await db
      .insert(schema.dishRelations)
      .values(slice)
      .onConflictDoNothing()
      .returning({ id: schema.dishRelations.id });
    inserted += res.length;
  }

  console.log(`  + ${inserted} dish-relation edges inserted (${DISH_RELATIONS.length} curated pairs × 2)`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
