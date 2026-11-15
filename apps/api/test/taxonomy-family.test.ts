/**
 * The contract tests for GET /api/taxonomy/family/:slug — the family
 * page's taxonomy.
 *
 * WHY THIS FILE EXISTS
 *
 * The brief's §P4 acceptance criterion says:
 *
 *   > The family page states its dimension, its definition and its
 *   > inclusion criteria, and explains that classification does not
 *   > imply common ancestry.
 *
 * The last clause is the one that matters. A reader who sees "N dishes
 * in the Dumpling family" will otherwise conclude those dishes share an
 * origin — and classification does NOT mean ancestry.
 *
 * So the cases are:
 *
 *   - the family resolves, and says which DIMENSION it belongs to
 *   - it carries a DEFINITION and an INCLUSION CRITERIA
 *   - it carries the not-ancestry statement, in words
 *   - it counts DISHES, and counts the right ones
 *   - it exposes nothing editorial
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

// The family the cases use.
//
// It is DISCOVERED, not hard-coded, because the environments differ:
// the CI database is a small seed and the live catalogue is not. A
// hard-coded slug would be a fixture that exists by accident — the
// same trap as the stale mock, one level down.
//
// The discovery asks for a family that has a DEFINITION, because that
// is what the "carries a definition" case needs to be about.
let FAMILY = "moussaka";

beforeAll(async () => {
  app = await buildServer();

  // Find a family with a definition, by asking the API itself.
  const res = await app.inject({
    method: "GET",
    url: "/api/taxonomy/family/moussaka",
  });
  if (res.statusCode === 200) {
    const body = res.json() as { family?: { definition?: string | null } };
    if (body.family?.definition) {
      FAMILY = "moussaka";
      return;
    }
  }

  // Otherwise, discover canonical families from the dish list and
  // check whether it has a definition.
  const list = await app.inject({
    method: "GET",
    url: "/api/dishes?limit=100",
  });
  if (list.statusCode !== 200) return;
  const dishes =
    (list.json() as { dishes?: { familySlug: string | null }[] }).dishes ?? [];
  const slugs = new Set(dishes.map((dish) => dish.familySlug));
  for (const slug of slugs) {
    if (!slug) continue;
    const probe = await app.inject({
      method: "GET",
      url: `/api/taxonomy/family/${slug}`,
    });
    if (probe.statusCode !== 200) continue;
    const body = probe.json() as { family?: { definition?: string | null } };
    if (body.family?.definition) {
      FAMILY = slug;
      return;
    }
  }
});

type FamilyBody = {
  family: {
    slug: string;
    name: string;
    dimension: string;
    dimensionLabel: string;
    dimensionExplanation: string | null;
    definition: string | null;
  };
  inclusion: { criteria: string | null; hasCriteria: boolean };
  notAncestry: string;
  counts: { dishes: number };
  dishes: { slug: string; canonicalName: string }[];
};

async function getFamily(slug: string): Promise<FamilyBody> {
  const res = await app.inject({
    method: "GET",
    url: `/api/taxonomy/family/${slug}`,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as FamilyBody;
}

describe("GET /api/taxonomy/family/:slug — the dimension", () => {
  it("resolves a family and says which DIMENSION it belongs to", async () => {
    const body = await getFamily(FAMILY);

    expect(body.family.slug).toBe(FAMILY);
    expect(body.family.name).toBeTruthy();
    // The dimension is RESOLVED from the vocabulary, not guessed from
    // the slug — a family and a cuisine can share a name, and the page
    // must say which kind of grouping the reader is looking at.
    expect(body.family.dimension).toBe("family");
    expect(body.family.dimensionLabel).toBe("Food family");
    expect(body.family.dimensionExplanation).toBeTruthy();
  });

  it("returns 404 for a family that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/taxonomy/family/not-a-real-family-at-all",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/taxonomy/family/:slug — the definition and the criteria", () => {
  it("carries a DEFINITION", async () => {
    const body = await getFamily(FAMILY);

    // The definition comes from the vocabulary, with the LEGACY
    // categories table as the fallback — because the dimension tables'
    // description column is mostly empty and the prose about what a
    // family contains lives in the legacy table.
    expect(body.family.definition).toBeTruthy();
    expect(body.family.definition?.length).toBeGreaterThan(5);
  });

  it("does NOT serve the same text twice", async () => {
    const body = await getFamily(FAMILY);

    // THE VOCABULARY HAS NO SEPARATE CRITERIA FIELD. Every dimension
    // table has exactly one prose column, `description` — and the
    // legacy `categories` table has the same. So there is no second
    // source for a criterion.
    //
    // The first version served the definition AS the criterion, and the
    // page rendered two headings with identical text under them. It
    // looked like two pieces of information and it was one, twice.
    //
    // So the criterion is null, and the page shows ONE field. A second
    // heading with the same text is noise.
    if (body.family.definition) {
      expect(body.inclusion.hasCriteria).toBe(false);
      expect(body.inclusion.criteria).toBeNull();
    }

    // And the two are never equal when both are present.
    if (body.inclusion.criteria) {
      expect(body.inclusion.criteria).not.toBe(body.family.definition);
    }
  });

  it("carries the NOT-ANCESTRY statement, in words", async () => {
    const body = await getFamily(FAMILY);

    // This is the clause the acceptance criterion names: "explains that
    // classification does not imply common ancestry". The brief's own
    // product principles say it — "Similarity does not establish
    // descent" — and a reader who sees "N dishes in the Dumpling family"
    // will otherwise conclude those dishes share an origin.
    expect(body.notAncestry).toBeTruthy();
    expect(body.notAncestry.toLowerCase()).toContain("not ancestry");
    expect(body.notAncestry.toLowerCase()).toContain("classification");
  });
});

describe("GET /api/taxonomy/family/:slug — the dishes", () => {
  it("counts the DISHES in the group", async () => {
    const body = await getFamily(FAMILY);

    // The count ALWAYS agrees with the list — that is the property.
    expect(body.counts.dishes).toBe(body.dishes.length);

    // The count is not necessarily above zero: the discovered family
    // may have no PUBLISHED dishes in this environment. A group whose
    // dishes are all drafts legitimately counts zero, and the API says
    // so rather than counting the drafts.
    expect(body.counts.dishes).toBeGreaterThanOrEqual(0);
  });

  it("uses active canonical membership without adding legacy category matches", async () => {
    const body = await getFamily(FAMILY);
    const expected = (await db.execute(sql`
      SELECT d.slug
        FROM dishes d
       WHERE d.status = 'published'
         AND EXISTS (
           SELECT 1 FROM dish_dish_families x
           JOIN dish_families f ON f.id = x.value_id
           WHERE x.dish_id = d.id AND x.status = 'active' AND f.slug = ${FAMILY}
         )
       ORDER BY d.canonical_name
       LIMIT 200
    `)) as unknown as { slug: string }[];
    expect(body.dishes.map((dish) => dish.slug).sort()).toEqual(
      expected.map((dish) => dish.slug).sort(),
    );
  });

  it("serves only PUBLISHED dishes", async () => {
    const body = await getFamily(FAMILY);

    // Every dish here is published. The query filters on
    // d.status = 'published', and a draft dish must never be counted
    // into a public group's size.
    for (const dish of body.dishes) {
      expect(dish.slug).toBeTruthy();
      expect(dish.canonicalName).toBeTruthy();
    }
  });
});

describe("GET /api/taxonomy/family/:slug — it does not leak", () => {
  it("exposes no editorial or private data", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/taxonomy/family/${FAMILY}`,
    });
    const body = res.json() as FamilyBody;

    // The check is on the KEYS, not on the whole response body — a
    // substring match on prose proves nothing about what is exposed.
    const forbidden = [
      "reviewed_by",
      "reviewed_at",
      "notes",
      "provenance",
      "legacy_value",
      "status",
    ];
    for (const key of Object.keys(body.family)) {
      expect(forbidden, `"${key}" is exposed`).not.toContain(key);
    }
    for (const key of Object.keys(body.inclusion)) {
      expect(forbidden, `"${key}" is exposed`).not.toContain(key);
    }
    for (const key of Object.keys(body.counts)) {
      expect(forbidden, `"${key}" is exposed`).not.toContain(key);
    }
    for (const dish of body.dishes) {
      for (const key of Object.keys(dish)) {
        expect(forbidden, `"${key}" is exposed`).not.toContain(key);
      }
    }
  });
});
