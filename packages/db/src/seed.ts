/**
 * Gustale — seed script
 *
 * Seeds a complete test dish (Moussaka) with all relations so the API
 * and frontend have something to render. Idempotent: re-running with
 * the same slug will skip the dish insert but refresh view_count.
 *
 * Usage:  pnpm --filter @gustale/db run seed
 *   or:   DATABASE_URL=... tsx packages/db/src/seed.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema/index.js';

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

  // 4. Preparation methods
  const bakeMethod = 'bake';
  const simmerMethod = 'simmer';
  await db
    .insert(schema.preparationMethods)
    .values([
      { slug: bakeMethod, name: 'Baking', category: 'dry-heat' },
      { slug: simmerMethod, name: 'Simmering', category: 'moist-heat' },
    ])
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

    // 11. Preparations
    const methods = await db
      .select({ id: schema.preparationMethods.id, slug: schema.preparationMethods.slug })
      .from(schema.preparationMethods)
      .where(sql`${schema.preparationMethods.slug} IN (${bakeMethod}, ${simmerMethod})`);
    const bakeId = methods.find((m) => m.slug === bakeMethod)!.id;
    const simmerId = methods.find((m) => m.slug === simmerMethod)!.id;
    await db.insert(schema.dishPreparations).values([
      {
        dishId,
        methodId: simmerId,
        sequenceOrder: 0,
        durationMinutes: 45,
        difficulty: 2,
        steps: 'Brown the minced lamb with onion and garlic. Add tomatoes, cinnamon, and a pinch of allspice. Simmer 30 minutes until thickened.',
      },
      {
        dishId,
        methodId: bakeId,
        sequenceOrder: 1,
        durationMinutes: 60,
        difficulty: 3,
        steps:
          'Layer fried eggplant slices and the meat sauce in a baking dish. Pour béchamel on top, sprinkle with kefalotyri. Bake at 180°C for 45 minutes until golden.',
      },
    ]);

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

  console.log(`\nSeed complete. Test dish: ${moussakaSlug}`);
  console.log(`\nTry: curl http://localhost:4000/api/dishes/${moussakaSlug} | jq .`);
  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
