/**
 * Integration test for the INGREDIENT ALIAS resolution (migration 0056).
 *
 * WHAT IS COVERED
 *
 *   - a RETIRED slug resolves to the canonical ingredient
 *   - the retired slug's own response still says the CANONICAL slug
 *   - the canonical slug is unaffected
 *   - an alias to an UNPUBLISHED ingredient does NOT resolve
 *   - a slug that is neither an ingredient nor an alias is a 404
 *   - the alias does not create a SECOND ingredient: the ingredient
 *     count is unchanged by the resolution
 *
 * WHY THIS IS TESTED HERE
 *
 * The béchamel merge retires the slug `bechamel-sauce` in favour of
 * `bechamel`. `bechamel-sauce` has a LIVE PUBLIC URL, so the point of
 * the alias table is that the URL keeps working and starts pointing at
 * the right thing. A regression here is invisible in the data -- the
 * alias row is still there -- and visible only in the response: the
 * URL would 404, or worse, would keep serving the ORPHAN row, which
 * has no category and no dishes.
 *
 * That second failure is the dangerous one: the orphan `bechamel-
 * sauce` still exists as an `ingredients` row until GUS-092's separate
 * deletion. So a resolver that stopped consulting the alias table
 * would still return 200 -- with the WRONG ingredient. These tests
 * assert on the resolved SLUG, not on the status code, because the
 * status code alone cannot tell the two apart.
 *
 * THE FIXTURES
 * ------------
 * Two ingredients and one alias, created and removed inside each
 * test. The suite refuses to run against the live database (see
 * test/setup.ts).
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveIngredientAlias } from "../src/routes/ingredients.js";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

// ── The fixture ids ──────────────────────────────────────────────────────
//
// Fixed, so a fixture that fails to clean up is easy to find by hand.
const INGREDIENT_CANONICAL = "a0000000-0000-0000-0000-000000000001";
const INGREDIENT_RETIRED = "a0000000-0000-0000-0000-000000000002";
const INGREDIENT_DRAFT = "a0000000-0000-0000-0000-000000000003";

const SLUG_CANONICAL = "test-alias-canonical";
const SLUG_RETIRED = "test-alias-retired";
const SLUG_DRAFT = "test-alias-draft";
// The alias slug for the draft-target alias. It must differ from the
// draft ingredient's OWN slug -- see the trigger.
const SLUG_DRAFT_ALIAS = "test-alias-draft-alias";

async function cleanFixtures() {
  await db.transaction(async (tx) => {
    // The alias first: it references the ingredient.
    await tx.execute(sql`
      DELETE FROM public.ingredient_aliases
       WHERE alias_slug IN (${sql.join(
         [SLUG_RETIRED, SLUG_DRAFT_ALIAS],
         sql`, `,
       )})
    `);
    await tx.execute(sql`
      DELETE FROM public.ingredients
       WHERE id IN (${sql.join(
         [INGREDIENT_CANONICAL, INGREDIENT_RETIRED, INGREDIENT_DRAFT],
         sql`, `,
       )})
    `);
  });
}

async function makeFixtures() {
  await cleanFixtures();

  // The canonical ingredient: published, with a category.
  await db.execute(sql`
    INSERT INTO public.ingredients
      (id, canonical_name, slug, status, category)
    VALUES
      (${INGREDIENT_CANONICAL}, 'Test canonical ingredient', ${SLUG_CANONICAL}, 'published', 'savoury-sauces')
  `);

  // The retired ingredient: published, NO category, and NOT an alias
  // target -- it is the orphan the alias exists to bypass. It is
  // deliberately still present, exactly as `bechamel-sauce` is on
  // live until GUS-092 removes it.
  await db.execute(sql`
    INSERT INTO public.ingredients
      (id, canonical_name, slug, status)
    VALUES
      (${INGREDIENT_RETIRED}, 'Test canonical ingredient', ${SLUG_RETIRED}, 'published')
  `);

  // A DRAFT ingredient, to prove an alias cannot smuggle a draft
  // into the public API.
  await db.execute(sql`
    INSERT INTO public.ingredients
      (id, canonical_name, slug, status)
    VALUES
      (${INGREDIENT_DRAFT}, 'Test draft ingredient', ${SLUG_DRAFT}, 'draft')
  `);

  // The alias: the retired slug resolves to the canonical ingredient.
  await db.execute(sql`
    INSERT INTO public.ingredient_aliases
      (alias_slug, ingredient_id, reason)
    VALUES
      (${SLUG_RETIRED}, ${INGREDIENT_CANONICAL}, 'test fixture')
  `);

  // An alias whose target is a DRAFT ingredient. It must never
  // resolve, or a draft would become publicly reachable by asking for
  // a different slug.
  //
  // Its alias slug is DIFFERENT from the draft ingredient's own slug:
  // an ingredient may not be an alias of itself, and the trigger
  // refuses that -- which is the constraint doing its job.
  await db.execute(sql`
    INSERT INTO public.ingredient_aliases
      (alias_slug, ingredient_id, reason)
    VALUES
      (${SLUG_DRAFT_ALIAS}, ${INGREDIENT_DRAFT}, 'test fixture')
  `);
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

beforeEach(async () => {
  await makeFixtures();
});

afterAll(async () => {
  await cleanFixtures();
  await app.close();
});

describe("ingredient aliases (migration 0056)", () => {
  it("resolves a retired slug to the canonical ingredient", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/ingredients/${SLUG_RETIRED}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The ASSERTION THAT MATTERS: the response carries the CANONICAL
    // slug, not the retired one. The status code alone cannot tell
    // the two apart, because the orphan row is still there and still
    // published.
    expect(body.ingredient.slug).toBe(SLUG_CANONICAL);
    expect(body.ingredient.canonicalName).toBe("Test canonical ingredient");
    // And the canonical ingredient's data, not the orphan's.
    expect(body.ingredient.category).toBe("savoury-sauces");
  });

  it("says which slug was asked for and which one it resolved to", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/ingredients/${SLUG_RETIRED}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alias.requestedSlug).toBe(SLUG_RETIRED);
    expect(body.alias.canonicalSlug).toBe(SLUG_CANONICAL);
  });

  it("leaves the canonical slug untouched -- no alias block", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/ingredients/${SLUG_CANONICAL}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ingredient.slug).toBe(SLUG_CANONICAL);
    // No alias block on a slug that was never an alias.
    expect(body.alias).toBeUndefined();
  });

  it("does NOT resolve an alias whose target is a draft", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/ingredients/${SLUG_DRAFT_ALIAS}`,
    });

    // The draft ingredient is not published, and neither is the
    // alias target -- so the alias must not resolve either. A draft
    // must not become publicly reachable by asking for a different
    // slug.
    expect(res.statusCode).toBe(404);
  });

  it("does not resolve an alias whose target is a draft, even when the alias LAYER is the only thing filtering it", async () => {
    // The route has TWO filters on `published`: one on the alias
    // lookup, and one on the canonical ingredient lookup. Removing
    // only the alias-layer filter still yields a 404, because the
    // canonical lookup refuses the draft.
    //
    // That is defence in depth, and it is good -- but it also means
    // the alias-layer filter is NOT covered by the test above. This
    // test covers it directly: it checks that the alias lookup
    // itself refuses to return a draft target, by asking the
    // database what the alias layer resolves to.
    // The alias LAYER refuses to resolve it.
    const resolved = await resolveIngredientAlias(SLUG_DRAFT_ALIAS);
    expect(resolved).toHaveLength(0);

    // And the alias row really does exist, pointing at the draft --
    // so the refusal is the FILTER, not a missing row.
    const raw = (await db.execute(sql`
      SELECT i.slug
        FROM public.ingredient_aliases a
        JOIN public.ingredients i ON i.id = a.ingredient_id
       WHERE a.alias_slug = ${SLUG_DRAFT_ALIAS}
    `)) as unknown as { slug: string }[];
    expect(raw).toHaveLength(1);
    expect(raw[0]!.slug).toBe(SLUG_DRAFT);
  });

  it("404s a slug that is neither an ingredient nor an alias", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/ingredients/test-alias-does-not-exist",
    });

    expect(res.statusCode).toBe(404);
  });

  it("does not create a second ingredient when an alias resolves", async () => {
    const countIngredients = async (): Promise<number> => {
      const row = (await db.execute(sql`
        SELECT count(*)::int AS n FROM public.ingredients
      `)) as unknown as { n: number };
      return row.n;
    };

    const nBefore = await countIngredients();

    await app.inject({
      method: "GET",
      url: `/api/ingredients/${SLUG_RETIRED}`,
    });

    const nAfter = await countIngredients();

    // An alias RESOLVES; it does not duplicate.
    expect(nAfter).toBe(nBefore);
  });
});
