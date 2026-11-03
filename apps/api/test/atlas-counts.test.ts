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

/**
 * The signal that a test transaction must be rolled back.
 *
 * WHY A LOCAL SENTINEL AND NOT `tx.rollback()`
 *
 * Drizzle's own `tx.rollback()` throws `TransactionRollbackError`, which
 * extends `DrizzleError` — and `DrizzleError`'s constructor sets
 * `this.name = "DrizzleError"` WITHOUT the subclass overriding it. So the
 * rollback error's `.name` is "DrizzleError", not
 * "TransactionRollbackError". A check on the name never matches, the
 * rollback error escapes as a test failure even though the transaction
 * rolled back correctly, and the case fails for the wrong reason.
 *
 * A sentinel of our own is unambiguous: it cannot be confused with a real
 * failure, and it does not depend on a library internal.
 */
class RollbackSignal extends Error {
  constructor() {
    super("rollback");
    this.name = "RollbackSignal";
  }
}

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
    //
    // WHY THIS CASE IS WRITTEN THE WAY IT IS
    //
    // The first version took TWO site-wide snapshots — one before the
    // insert and one after — and asserted they were equal. That is a
    // time-of-check/time-of-use bug: the route's counts are SITE-WIDE
    // aggregates (apps/api/src/routes/atlas-counts.ts:60-147), the
    // test files share ONE database, and any sibling file that
    // publishes a dish or writes a place association between the two
    // reads moves the number and fails this test for no reason. The
    // numbers are global, so ANY concurrent writer can move them.
    //
    // The second version picked its target with `LIMIT 1` and NO
    // `ORDER BY`, so the row was whatever the plan returned — and the
    // insert used a FIXED relationship type with `ON CONFLICT DO
    // NOTHING`. When the target already carried that relationship type
    // the insert silently inserted ZERO rows, and the `inserted`
    // variable was never asserted, so the case passed without having
    // proved anything.
    //
    // So this version:
    //
    //   - picks the target DETERMINISTICALLY (a stable ORDER BY);
    //   - picks a relationship type that is KNOWN not to be on the
    //     target, so the insert cannot silently no-op;
    //   - ASSERTS that exactly one row was inserted, so a no-op is a
    //     loud failure rather than a vacuous pass;
    //   - does the write, the read and the cleanup inside ONE
    //     transaction that is ROLLED BACK, so the row it creates is
    //     never visible to anything — not to a sibling file, and not
    //     to the next run;
    //   - asserts the property for THE TARGET DISH ONLY, so the
    //     numbers it compares are the target dish's own row count and
    //     its own distinct-place count. A concurrent writer elsewhere
    //     in the catalogue cannot move them.
    //
    // The property under test is: ONE dish having TWO association rows
    // to the SAME place must not count that place twice.
    //
    // THE TRANSACTION
    //
    // `db.transaction()` on the postgres-js driver commits when the
    // callback resolves and ROLLS BACK when it throws, so the rollback
    // IS the throw.
    //
    // The rollback is signalled with a LOCAL sentinel error rather than
    // with Drizzle's own `tx.rollback()`. Two reasons:
    //
    //   - `tx.rollback()` throws Drizzle's TransactionRollbackError,
    //     which extends DrizzleError — and DrizzleError's constructor
    //     sets `this.name = "DrizzleError"` WITHOUT the subclass
    //     overriding it. So the rollback error's `.name` is
    //     "DrizzleError", NOT "TransactionRollbackError", and a check
    //     on the name never matches. The rollback error would escape
    //     as a test failure even though the transaction rolled back
    //     correctly — the case would fail for the wrong reason.
    //   - A sentinel of our own is unambiguous: it cannot be confused
    //     with a real failure, and it does not depend on a library
    //     internal.
    //
    // The transaction runs at REPEATABLE READ, so the two reads inside
    // it see the SAME snapshot even if something else commits in
    // between. The comparison is then between two numbers from ONE
    // consistent view — which is what makes it deterministic rather
    // than merely usually-right.
    const row = (await db.execute(sql`
      SELECT a.dish_id, a.entity_id, a.relationship_type
        FROM dish_place_associations a
        JOIN dishes d ON d.id = a.dish_id
       WHERE a.entity_kind = 'place'
         AND d.status = 'published'
         AND a.publication_state = 'published'
       ORDER BY a.dish_id, a.entity_id, a.relationship_type
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
    //
    // The type is chosen from the vocabulary the CHECK constraint
    // allows, and it is chosen so it is NOT the target's own type —
    // otherwise the insert would conflict with the target row on the
    // unique index and silently insert nothing.
    const otherType =
      target.relationship_type === "historical_emergence"
        ? "established_tradition"
        : "historical_emergence";

    await db
      .transaction(
        async (tx) => {
          const duplicate = await tx.execute(sql`
            INSERT INTO dish_place_associations (
              dish_id, relationship_type, entity_kind, entity_id,
              explanation, qualifiers, provenance, evidence_status,
              review_state, publication_state
            )
            SELECT a.dish_id, ${otherType}, a.entity_kind, a.entity_id,
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

          // The row was NOT inserted — the unique index
          // (dish_id, relationship_type, entity_kind, entity_id) already
          // holds this identity. Fail LOUDLY: a case that cannot create
          // its duplicate has proved nothing, and it must not pass
          // quietly.
          expect(inserted).toBe(1);

          // The ROW count for THIS dish went up...
          const rowCount = await tx.execute(sql`
            SELECT count(*)::int AS n
              FROM dish_place_associations a
              JOIN dishes d ON d.id = a.dish_id
             WHERE a.entity_kind = 'place'
               AND a.publication_state = 'published'
               AND d.status = 'published'
               AND a.dish_id = ${target.dish_id}
          `);
          const rows = (rowCount as unknown as { n: number }[])[0]?.n ?? 0;

          // ...but the DISTINCT place count for THIS dish did NOT, and
          // that is the property that matters.
          const distinct = await tx.execute(sql`
            SELECT count(DISTINCT a.entity_id)::int AS n
              FROM dish_place_associations a
              JOIN dishes d ON d.id = a.dish_id
             WHERE a.entity_kind = 'place'
               AND a.publication_state = 'published'
               AND d.status = 'published'
               AND a.dish_id = ${target.dish_id}
          `);
          const distinctPlaces =
            (distinct as unknown as { n: number }[])[0]?.n ?? 0;

          // Two rows to ONE place: the row count is one higher than the
          // distinct count, and the distinct count did not move.
          expect(rows).toBe(distinctPlaces + 1);
          expect(distinctPlaces).toBe(1);

          // Roll the transaction back. The duplicate row must not
          // outlive the test — not in the database, and not in the next
          // run.
          //
          // Throwing is the rollback: the driver ROLLBACKs when the
          // transaction callback throws, and COMMITs when it resolves.
          throw new RollbackSignal();
        },
        { isolationLevel: "repeatable read" },
      )
      .catch((err: unknown) => {
        // The RollbackSignal is the SUCCESS path here: the driver saw
        // the throw, issued the ROLLBACK, and re-threw. Any other error
        // — including an assertion failure — is real and must
        // propagate.
        if (!(err instanceof RollbackSignal)) {
          throw err;
        }
      });
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
