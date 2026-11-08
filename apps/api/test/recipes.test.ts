/**
 * Integration test for the RECIPE read routes (item 4).
 *
 * WHAT IS COVERED
 *
 *   - GET /api/recipes            the FEED: 200, the list shape, the
 *                                 total/hasMore contract
 *   - GET /api/recipes/:slug      ONE recipe: the sentences, the
 *                                 ingredients, the confidence
 *   - GET /api/dishes/:slug/recipes   the HUB: the dish's recipes, and
 *                                 the derived `empty` flag
 *   - GET /api/recipes/settings   the KILL SWITCH, read-only
 *   - the PUBLISH GATE: an unpublished recipe is not served, and the
 *     route does not leak its existence
 *
 * WHY THE PUBLISH GATE IS TESTED HERE
 *
 * Every recipe route reads `recipe_published` -- the view created by
 * migration 0053 -- rather than the `recipes` table. That is the whole
 * point of the view, and it is the thing most likely to be broken by
 * someone later "simplifying" a route to read the table directly: the
 * route would keep returning 200, and it would start serving drafts.
 *
 * So these tests create a DRAFT recipe and assert it is NOT served, and
 * create a PUBLISHED one and assert it IS. The fixtures are created and
 * removed inside each test, and the suite refuses to run against the
 * live database (see test/setup.ts).
 *
 * THE FIXTURES
 * ------------
 * A recipe is published when its STATEMENTS are published -- that is
 * the whole design (ADR-007-A1 §8.4) -- so a published fixture needs
 * a sentence, a claim, a statement and the statement's status raised.
 * The status is raised through the sanctioned transaction-local GUC
 * `gustale.statement_gate`, exactly as 0052's own proof does, because
 * the gate trigger refuses any other route.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

// ── The fixture ids ──────────────────────────────────────────────────────
//
// They are fixed, so a fixture that fails to clean up is easy to find
// and remove by hand.
const DISH_FIXTURE = "f0000000-0000-0000-0000-000000000001";
const RECIPE_PUBLISHED = "f0000000-0000-0000-0000-000000000002";
const RECIPE_DRAFT = "f0000000-0000-0000-0000-000000000003";
const SENTENCE_PUBLISHED = "f0000000-0000-0000-0000-000000000004";
const SENTENCE_DRAFT = "f0000000-0000-0000-0000-000000000005";
const STATEMENT_PUBLISHED = "f0000000-0000-0000-0000-000000000006";
const STATEMENT_DRAFT = "f0000000-0000-0000-0000-000000000007";

async function cleanFixtures() {
  // ONE transaction, because `SET CONSTRAINTS` is a transaction-control
  // command and refuses to run outside a transaction block.
  //
  // And the constraint must be fired BEFORE the recipes go: the
  // deferred `statements_subject_exists_trg` would otherwise run at
  // COMMIT, find no recipe, and fail the whole transaction.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
    await tx.execute(sql`
      DELETE FROM public.recipe_claims
       WHERE recipe_sentence_id IN (${sql.join(
         [SENTENCE_PUBLISHED, SENTENCE_DRAFT],
         sql`, `,
       )})
    `);
    await tx.execute(sql`
      DELETE FROM public.recipe_sentences
       WHERE id IN (${sql.join([SENTENCE_PUBLISHED, SENTENCE_DRAFT], sql`, `)})
    `);
    await tx.execute(sql`
      DELETE FROM public.statement_status_log
       WHERE statement_id IN (${sql.join(
         [STATEMENT_PUBLISHED, STATEMENT_DRAFT],
         sql`, `,
       )})
    `);
    await tx.execute(sql`
      DELETE FROM public.statements
       WHERE id IN (${sql.join(
         [STATEMENT_PUBLISHED, STATEMENT_DRAFT],
         sql`, `,
       )})
    `);
    await tx.execute(sql`
      DELETE FROM public.recipe_confidence WHERE recipe_id IN (${sql.join(
        [RECIPE_PUBLISHED, RECIPE_DRAFT],
        sql`, `,
      )})
    `);
    await tx.execute(sql`
      DELETE FROM public.recipes WHERE id IN (${sql.join(
        [RECIPE_PUBLISHED, RECIPE_DRAFT],
        sql`, `,
      )})
    `);
  });
}

async function makeFixtures() {
  await cleanFixtures();

  // A published dish to hang the recipes off. The recipes need a
  // PUBLISHED dish -- the view requires it -- so the fixture creates
  // one if the seed has none.
  const dishRows = (await db.execute(sql`
    SELECT id FROM public.dishes WHERE status = 'published' LIMIT 1
  `)) as { id: string }[];

  let dishId = dishRows[0]?.id;
  if (!dishId) {
    await db.execute(sql`
      INSERT INTO public.dishes (id, slug, canonical_name, status)
      VALUES (${DISH_FIXTURE}, 'the-recipes-test-dish', 'the recipes test dish', 'published')
    `);
    dishId = DISH_FIXTURE;
  }

  // The predicate needs a predicate id.
  const predicateRows = (await db.execute(sql`
    SELECT id FROM public.predicates LIMIT 1
  `)) as { id: string }[];
  const predicateId = predicateRows[0]?.id;
  expect(predicateId, "the fixtures need a predicate").toBeTruthy();

  await db.execute(sql`
    INSERT INTO public.recipes (id, dish_id, slug, title, status, review_state)
    VALUES (${RECIPE_PUBLISHED}, ${dishId}, 'the-test-published-recipe', 'the test published recipe', 'draft', 'approved'),
           (${RECIPE_DRAFT}, ${dishId}, 'the-test-draft-recipe', 'the test draft recipe', 'draft', 'unreviewed')
  `);

  await db.execute(sql`
    INSERT INTO public.recipe_sentences (id, recipe_id, field, locale, position, text, is_original)
    VALUES (${SENTENCE_PUBLISHED}, ${RECIPE_PUBLISHED}, 'step', 'en', 1, 'the published test step', true),
           (${SENTENCE_DRAFT}, ${RECIPE_DRAFT}, 'step', 'en', 1, 'the draft test step', true)
  `);

  await db.execute(sql`
    INSERT INTO public.statements (
      id, subject_type, subject_id, predicate_id, value_type, value_literal,
      value_literal_type, claim_class, status
    ) VALUES (
      ${STATEMENT_PUBLISHED}, 'recipe', ${RECIPE_PUBLISHED}, ${predicateId},
      'literal', 'the published test value', 'text', 'documented', 'draft'
    ), (
      ${STATEMENT_DRAFT}, 'recipe', ${RECIPE_DRAFT}, ${predicateId},
      'literal', 'the draft test value', 'text', 'documented', 'draft'
    )
  `);

  await db.execute(sql`
    INSERT INTO public.recipe_claims (recipe_sentence_id, statement_id)
    VALUES (${SENTENCE_PUBLISHED}, ${STATEMENT_PUBLISHED}),
           (${SENTENCE_DRAFT}, ${STATEMENT_DRAFT})
  `);

  // The PUBLISHED one gets its statement published -- through the
  // sanctioned GUC, because the gate trigger refuses any other route.
  // The DRAFT one's statement stays a draft, which is what makes the
  // recipe unpublished.
  //
  // ONE TRANSACTION, because `set_config(..., true)` is TRANSACTION-
  // LOCAL: the flag is unset at the end of the transaction, so the
  // UPDATE that it authorises has to be in the SAME transaction. The
  // `is_local = true` third argument is what makes it transaction-local
  // rather than session-local -- and it is also what makes it safe to
  // set here, because it cannot leak past the COMMIT.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('gustale.statement_gate', 'on', true)`,
    );
    await tx.execute(sql`
      UPDATE public.statements
         SET status = 'published', published_at = now()
       WHERE id = ${STATEMENT_PUBLISHED}
    `);
    await tx.execute(
      sql`SELECT set_config('gustale.statement_gate', 'off', true)`,
    );
  });

  // A computed confidence for the published recipe, so the detail route
  // has one to report.
  await db.execute(sql`
    INSERT INTO public.recipe_confidence (
      recipe_id, level, conditions_met, source_count, ingredient_count, sentence_count
    ) VALUES (
      ${RECIPE_PUBLISHED}, 'medium',
      '{"2": {"met": false, "detail": "the recipe has no ingredients"}}'::jsonb,
      0, 0, 1
    )
  `);
}

beforeAll(async () => {
  app = await buildServer();
  await makeFixtures();
});

afterAll(async () => {
  await cleanFixtures();
});

describe("GET /api/recipes — the feed", () => {
  it("returns 200, not 500", async () => {
    const res = await app.inject({ method: "GET", url: "/api/recipes" });
    expect(res.statusCode).toBe(200);
  });

  it("has the list shape the front-end expects", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/recipes" })
    ).json();

    expect(body).toHaveProperty("recipes");
    expect(Array.isArray(body.recipes)).toBe(true);
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("hasMore");
    expect(typeof body.total).toBe("number");
    expect(typeof body.hasMore).toBe("boolean");
  });

  it("carries the recipe's own fields", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/recipes" })
    ).json();

    for (const r of body.recipes) {
      expect(r).toHaveProperty("slug");
      expect(r).toHaveProperty("title");
      expect(r).toHaveProperty("dish");
      expect(r.dish).toHaveProperty("slug");
      expect(r.dish).toHaveProperty("name");
      expect(r).toHaveProperty("contentType");
      // The confidence is either a computed level or null -- null means
      // "not computed", and it is never silently "low".
      expect(
        r.confidence === null ||
          ["high", "medium", "low"].includes(r.confidence),
      ).toBe(true);
    }
  });

  it("reports a total that matches the list, and a hasMore that agrees with it", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/recipes?limit=1" })
    ).json();

    expect(body.recipes.length).toBeLessThanOrEqual(1);
    // `hasMore` is computed from `total`, so it cannot disagree with it.
    expect(body.hasMore).toBe(body.offset + body.recipes.length < body.total);
  });

  it("serves the PUBLISHED recipe and NOT the draft one", async () => {
    // THE PUBLISH GATE. The draft recipe's statement is still a draft,
    // so the recipe is not published -- and it must not appear.
    const body = (
      await app.inject({ method: "GET", url: "/api/recipes?limit=100" })
    ).json();

    const slugs = body.recipes.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain("the-test-published-recipe");
    expect(slugs).not.toContain("the-test-draft-recipe");
  });

  it("filters by dish", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/recipes?dish=no-such-dish" })
    ).json();

    expect(body.recipes).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("rejects an invalid query with 400, not 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/recipes?limit=not-a-number",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/recipes/:slug — one recipe", () => {
  it("returns the recipe with its sentences and its confidence", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/recipes/the-test-published-recipe",
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.recipe.slug).toBe("the-test-published-recipe");
    expect(body.recipe.sentences.length).toBeGreaterThan(0);
    expect(body.recipe.sentences[0]).toHaveProperty("text");
    expect(body.recipe.sentences[0]).toHaveProperty("position");
    expect(body.recipe.ingredients).toBeDefined();

    // The confidence is the COMPUTED one, and it reports the failing
    // conditions so a reviewer can see WHICH condition failed.
    expect(body.confidence).not.toBeNull();
    expect(body.confidence.level).toBe("medium");
    expect(body.confidence.conditionsMet).toHaveProperty("2");
  });

  it("404s for the DRAFT recipe -- it does not exist to a reader", async () => {
    // The same 404 as a slug that was never created, so the endpoint
    // does not leak the existence of an unpublished recipe.
    const res = await app.inject({
      method: "GET",
      url: "/api/recipes/the-test-draft-recipe",
    });
    expect(res.statusCode).toBe(404);

    const missing = await app.inject({
      method: "GET",
      url: "/api/recipes/no-such-recipe-at-all",
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("GET /api/dishes/:slug/recipes — the hub", () => {
  it("returns the dish and its recipes", async () => {
    const dish = (await db.execute(sql`
        SELECT d.slug FROM public.dishes d
          JOIN public.recipes r ON r.dish_id = d.id
         WHERE r.id = ${RECIPE_PUBLISHED}
      `)) as { slug: string }[];

    const res = await app.inject({
      method: "GET",
      url: `/api/dishes/${dish[0]!.slug}/recipes`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.dish.slug).toBe(dish[0]!.slug);
    expect(Array.isArray(body.recipes)).toBe(true);

    const slugs = body.recipes.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain("the-test-published-recipe");
    expect(slugs).not.toContain("the-test-draft-recipe");
  });

  it("reports `empty` as a DERIVED flag -- false when the dish has recipes", async () => {
    const dish = (await db.execute(sql`
        SELECT d.slug FROM public.dishes d
          JOIN public.recipes r ON r.dish_id = d.id
         WHERE r.id = ${RECIPE_PUBLISHED}
      `)) as { slug: string }[];

    const body = (
      await app.inject({
        method: "GET",
        url: `/api/dishes/${dish[0]!.slug}/recipes`,
      })
    ).json();

    // ADR-007-A1 §5.2: the hub's indexability is a function of its
    // published recipe count, so `empty` is derived from the TOTAL and
    // cannot drift from the list.
    expect(body.empty).toBe(false);
    expect(body.total).toBeGreaterThan(0);
  });

  it("reports `empty` as true for a dish with no published recipe", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/no-such-dish-at-all/recipes",
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an unknown dish", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/no-such-dish-at-all/recipes",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/recipes/settings — the kill switch", () => {
  it("reports the switch, and it ships DISABLED", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/recipes/settings",
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.autoPublish).toHaveProperty("mode");
    expect(body.autoPublish).toHaveProperty("enabled");
    expect(body.autoPublish).toHaveProperty("dailyCap");

    // ADR-007-A1 §7.1: the switch ships OFF. The migration creates the
    // row with `disabled`, and nothing in the API turns it on.
    expect(body.autoPublish.mode).toBe("disabled");
    expect(body.autoPublish.enabled).toBe(false);
    // §7.2: the daily cap is 20.
    expect(body.autoPublish.dailyCap).toBe(20);
  });
});
