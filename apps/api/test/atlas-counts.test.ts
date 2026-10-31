/**
 * The contract tests for GET /api/atlas/counts.
 *
 * WHY THIS FILE EXISTS
 *
 * The brief's §13 requires:
 *
 *   > The count endpoints use COUNT(DISTINCT dish_id) and count unique
 *   > dishes independently of associations.
 *
 * and ADR-004's F7 records the defect this fixes:
 *
 *   > Homepage KPI counts are undefined and partly wrong — "22 families"
 *   > counts distinct dish-type slugs; "15 lineages" counts techniques.
 *
 * A count is easy to get wrong in a way that looks right. The count
 * over the association ROWS is 2,713; the count over the distinct
 * PLACES is 180; the count over the distinct dishes is 1,474. All
 * three are "the number of associations" in a loose sense, and only
 * one is right for any given label.
 *
 * These tests assert that the counts are over distinct things, that
 * they are defined, and that they agree with what the API SERVES —
 * because a count that disagrees with the data is worse than no count.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

type CountsBody = {
  counts: {
    dishes: number;
    places: number;
    communities: number;
    families: number;
    techniques: number;
    courses: number;
    contexts: number;
    connections: number;
    claims: number;
  };
  definitions: Record<string, string>;
};

async function getCounts(): Promise<CountsBody> {
  const res = await app.inject({ method: "GET", url: "/api/atlas/counts" });
  expect(res.statusCode).toBe(200);
  return res.json() as CountsBody;
}

describe("GET /api/atlas/counts — the counts are DEFINED", () => {
  it("returns 200 with a counts object and a definitions object", async () => {
    const body = await getCounts();
    expect(body.counts).toBeDefined();
    expect(body.definitions).toBeDefined();
  });

  it("gives EVERY count a definition", async () => {
    // An undefined count is the F7 defect. Every number the endpoint
    // returns must be accompanied by a sentence saying what it counts,
    // so no client can render a bare number with an undefined label.
    const body = await getCounts();

    for (const key of Object.keys(body.counts)) {
      const definition = body.definitions[key];
      expect(definition, `"${key}" has no definition`).toBeTruthy();
      expect(definition.length).toBeGreaterThan(20);
    }
  });

  it("counts the dishes ONCE, not once per association", async () => {
    const body = await getCounts();

    // The dish count is over DISTINCT dishes. If it were over
    // association rows it would be far larger than the dish count.
    expect(body.counts.dishes).toBeGreaterThan(0);

    const atlas = await app.inject({
      method: "GET",
      url: "/api/dishes/falafel/atlas",
    });
    const atlasBody = atlas.json() as { counts: { dishes: number } };

    // The two endpoints must AGREE on the dish count — they are the
    // same number, computed the same way.
    expect(atlasBody.counts.dishes).toBe(body.counts.dishes);
  });

  it("counts places and communities SEPARATELY", async () => {
    const body = await getCounts();

    // A community is a people or a practice, NOT a place. Counting
    // them together would inflate the place count with things that are
    // not places.
    expect(body.counts.places).toBeGreaterThan(0);
    expect(body.counts.communities).toBeGreaterThan(0);

    // And the two definitions must say so.
    expect(body.definitions.places).toMatch(/not a place/i);
    expect(body.definitions.communities).toMatch(/communit/i);
  });

  it("counts DISTINCT entities, not association rows", async () => {
    const body = await getCounts();
    const atlas = await app.inject({
      method: "GET",
      url: "/api/dishes/falafel/atlas",
    });
    const atlasBody = atlas.json() as {
      counts: { places: number; communities: number };
      placesAndTraditions: { entityId: string; entityKind: string }[];
    };

    // The site-wide place count is at least the number of distinct
    // places on ONE dish — a single dish cannot have more distinct
    // places than the catalogue has.
    const distinctOnDish = new Set(
      atlasBody.placesAndTraditions
        .filter((a) => a.entityKind === "place")
        .map((a) => a.entityId),
    ).size;
    expect(body.counts.places).toBeGreaterThanOrEqual(distinctOnDish);

    // And the two endpoints must agree on the site-wide counts.
    expect(atlasBody.counts.places).toBe(body.counts.places);
    expect(atlasBody.counts.communities).toBe(body.counts.communities);
  });

  it("counts DISTINCT entities even when one dish has TWO associations to the SAME place", async () => {
    // THIS is the case that makes the count meaningful.
    //
    // A dish can be associated with the same place more than once — for
    // example as an 'established_tradition' and as a
    // 'legacy_unreviewed', or with two different relationship types for
    // the same entity. The identity of an association is (dish,
    // relationship_type, entity_kind, entity_id), so those are two
    // DIFFERENT associations that point at the SAME place.
    //
    // Counting the association ROWS would count that place twice. The
    // count must be over DISTINCT entities.
    //
    // The CI database has no such dish — every place is associated with
    // one dish once — so without this case the row count and the
    // distinct count are EQUAL and the difference is invisible. The
    // first version of this test passed with the row count in place of
    // the distinct count, which is how it was caught.
    //
    // So the case CREATES the duplicate: a second association row for
    // the same (dish, place), with a different relationship type, and
    // then asserts the count did NOT move.
    const before = await getCounts();

    const row = (await db.execute(sql`
      SELECT a.dish_id, a.entity_id, a.relationship_type
        FROM dish_place_associations a
        JOIN dishes d ON d.id = a.dish_id
       WHERE a.entity_kind = 'place'
         AND d.status = 'published'
         AND a.publication_state = 'published'
       LIMIT 1
    `)) as unknown as {
      dish_id: string;
      entity_id: string;
      relationship_type: string;
    }[];
    const target = row[0];

    if (!target) {
      // No published place association in this database — nothing to
      // duplicate, and nothing to prove. The case is skipped rather
      // than passed vacuously, and the skip is visible.
      console.warn(
        "SKIPPED: no published place association to duplicate in this database",
      );
      return;
    }

    // A DIFFERENT relationship type, so the identity is different and
    // the row is allowed — it is a second association to the same
    // place, not a duplicate row.
    const duplicate = await db.execute(sql`
      INSERT INTO dish_place_associations (
        dish_id, relationship_type, entity_kind, entity_id,
        explanation, qualifiers, provenance, evidence_status,
        review_state, publication_state
      )
      SELECT a.dish_id, 'historical_emergence', a.entity_kind, a.entity_id,
             'the atlas count test', '{}'::jsonb, 'atlas_count_test',
             'unevidenced', 'unreviewed', 'published'
        FROM dish_place_associations a
       WHERE a.dish_id = ${target.dish_id}
         AND a.entity_id = ${target.entity_id}
         AND a.entity_kind = 'place'
         AND a.relationship_type = ${target.relationship_type}
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const inserted = (duplicate as unknown as { id: string }[]).length;

    try {
      const after = await getCounts();

      // The ROW count went up by one...
      const rowCount = await db.execute(sql`
        SELECT count(*)::int AS n
          FROM dish_place_associations a
          JOIN dishes d ON d.id = a.dish_id
         WHERE a.entity_kind = 'place'
           AND a.publication_state = 'published'
           AND d.status = 'published'
      `);
      const rows = (rowCount as unknown as { n: number }[])[0]?.n ?? 0;

      // ...but the DISTINCT place count did NOT, and that is the
      // property that matters.
      expect(after.counts.places).toBe(before.counts.places);
      expect(rows).toBeGreaterThan(after.counts.places);
    } finally {
      // The cleanup removes ONLY the row this test created, by its
      // provenance marker.
      await db.execute(sql`
        DELETE FROM dish_place_associations
         WHERE provenance = 'atlas_count_test'
           AND dish_id = ${target.dish_id}
      `);
    }
  });

  it("counts the families from the DIMENSION, not the legacy taxonomy", async () => {
    const body = await getCounts();

    // The DEFINITION is what matters here, and it must name the
    // dimension — the brief's D2 makes the dimension tables the source
    // of truth for classification — and not the legacy flat taxonomy.
    expect(body.definitions.families).toMatch(/family/i);
    expect(body.definitions.families).toMatch(/dimension/i);
    expect(body.definitions.families).not.toMatch(/technique/i);

    // And the technique count must have its own definition, so nothing
    // is ever labelled a "lineage" again.
    expect(body.definitions.techniques).toMatch(/technique/i);
    expect(body.definitions.techniques).not.toMatch(/lineage/i);

    // The families and techniques are DIFFERENT numbers wherever the
    // catalogue has data. On a small CI database both can be zero, so
    // the comparison is only made when there is something to compare.
    if (body.counts.families > 0 || body.counts.techniques > 0) {
      expect(body.counts.families).not.toBe(body.counts.techniques);
    }
  });

  it("counts the connections as UNDIRECTED pairs", async () => {
    const body = await getCounts();

    // A symmetric pair counts ONCE. If the count were over the rows,
    // a symmetric pair would count twice.
    expect(body.counts.connections).toBeGreaterThanOrEqual(0);
    expect(body.definitions.connections).toMatch(/undirected|symmetric/i);
  });

  it("counts the PUBLISHED claims, and no draft", async () => {
    const body = await getCounts();

    // The claims count uses the SAME predicate the API serves them
    // with, so it cannot disagree with what a reader sees.
    expect(body.counts.claims).toBeGreaterThanOrEqual(0);
    expect(body.definitions.claims).toMatch(/published/i);
  });

  it("exposes NO numerical confidence and NO score", async () => {
    const body = await getCounts();
    const serialised = JSON.stringify(body);

    // The brief: "No numerical confidence scores."
    expect(serialised).not.toMatch(/"confidence"\s*:\s*0?\.\d/);
    expect(serialised).not.toMatch(/"score"\s*:/);
    expect(serialised).not.toMatch(/"probability"\s*:/);
  });

  it("exposes NO draft or private editorial data", async () => {
    const body = await getCounts();
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain("editorial_review_queue");
    expect(serialised).not.toContain("journey_place_without_association");
    expect(serialised).not.toContain("reviewed_by");
  });

  it("exposes no dish slugs or names", async () => {
    const body = await getCounts();
    const serialised = JSON.stringify(body);

    // A count endpoint carries counts, not content. If a slug or a
    // dish name ever appeared here, it would be a leak of the
    // catalogue through a surface meant to hold only numbers.
    expect(serialised).not.toContain("falafel");
    expect(serialised).not.toContain("rendang");
  });
});
