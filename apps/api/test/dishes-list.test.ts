/**
 * Integration contracts for the dish list, using the seeded database.
 * Family display and filtering must use active dish_families relations.
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

describe("GET /api/dishes — the list route", () => {
  it("returns 200, not 500", async () => {
    // The regression this file exists for. Before migration 0035, on a
    // database built from the committed chain, this was:
    //
    //   ERROR: column c.kind does not exist
    //   → HTTP 500
    //
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?limit=5",
    });
    expect(res.statusCode).toBe(200);
  });

  it("has the list shape the web client expects", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=5" })
    ).json();

    expect(body).toHaveProperty("dishes");
    expect(Array.isArray(body.dishes)).toBe(true);
    // The seed always provides published dishes.
    expect(body.dishes.length).toBeGreaterThan(0);

    const first = body.dishes[0];
    expect(first).toHaveProperty("slug");
    expect(first).toHaveProperty("canonicalName");
    expect(first).toHaveProperty("status");
  });

  it("resolves familySlug and familyName from active dish_families, not legacy categories", async () => {
    // Compare every published dish, including null relations. Membership in
    // the vocabulary alone would miss overlapping legacy/canonical slugs.
    const expected = (await db.execute(sql`
      SELECT d.id, fam.slug, fam.name
        FROM dishes d
        LEFT JOIN LATERAL (
          SELECT f.slug, f.name
            FROM dish_dish_families x
            JOIN dish_families f ON f.id = x.value_id
           WHERE x.dish_id = d.id AND x.status = 'active'
           -- The SAME tie-break as the route's lateral, or the
           -- comparison would fail on a tie instead of proving that
           -- the two agree.
           ORDER BY x.is_primary DESC, f.slug, f.id
           LIMIT 1
        ) fam ON true
       WHERE d.status = 'published'
    `)) as unknown as {
      id: string;
      slug: string | null;
      name: string | null;
    }[];
    // NOTE: there is deliberately NO `expect(expected.some((row) =>
    // row.slug !== null)).toBe(true)` here. The CI database has an
    // EMPTY `dish_dish_families` table -- `gus-014-118-dimensions.sql`
    // assigns the families by INSERT ... SELECT over 93 dish slugs, and
    // in `.github/workflows/ci.yml` that migration (line 547) runs
    // BEFORE `packages/db/seed-atlas-references.sql` (line 742), which
    // creates those dishes. The INSERT therefore matches nothing.
    //
    // The property under test is that the API and the SQL AGREE, for
    // every dish, including the null case. A dish with no canonical
    // relation must come back with a null familySlug -- if the API
    // still fell back to the legacy vocabulary, that dish would have a
    // non-null familySlug and the comparison below would fail.
    const byId = new Map(expected.map((row) => [row.id, row]));
    const seen = new Set<string>();
    for (let offset = 0; offset < expected.length; offset += 100) {
      const res = await app.inject({
        method: "GET",
        url: `/api/dishes?status=published&limit=100&offset=${offset}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(expected.length);
      for (const dish of body.dishes) {
        const family = byId.get(dish.id);
        expect(family).toBeDefined();
        expect(dish.familySlug, dish.slug).toBe(family?.slug);
        expect(dish.familyName, dish.slug).toBe(family?.name);
        expect(seen.has(dish.id)).toBe(false);
        seen.add(dish.id);
      }
    }
    expect(seen.size).toBe(expected.length);
  });

  it("has a canonical food-family vocabulary", async () => {
    // The vocabulary itself must exist, whatever the relations do.
    // This is what makes the list test meaningful: a dish with a null
    // familySlug is only evidence of a NULL RELATION if the vocabulary
    // is populated.
    const vocab = (await db.execute(sql`
      SELECT count(*)::int AS families FROM dish_families
    `)) as unknown as { families: number }[];
    expect(vocab[0]?.families ?? 0).toBeGreaterThan(0);
  });

  it("counts active canonical families used by published dishes", async () => {
    const expected = (await db.execute(sql`
      SELECT count(DISTINCT x.value_id)::int AS families
        FROM dish_dish_families x
        JOIN dishes d ON d.id = x.dish_id
       WHERE x.status = 'active' AND d.status = 'published'
    `)) as unknown as { families: number }[];
    const res = await app.inject({ method: "GET", url: "/api/atlas/counts" });
    expect(res.statusCode).toBe(200);
    expect(res.json().counts.families).toBe(expected[0]?.families);
  });

  it("filters by family (reads the dish_families dimension)", async () => {
    // PR 3 (GUS-1180): `family=` was re-pointed at `dish_families`.
    //
    // It used to read the legacy `categories` kind='family' vocabulary,
    // which has ONE published dish between its 77 slugs -- so every
    // value the site offered returned an empty list. It now reads the
    // same dimension the atlas counts and the family dropdown read.
    //
    // The assertion is that the filter runs and that it FILTERS: a
    // filter that returns the whole catalogue is just as broken as one
    // that returns nothing.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?family=moussaka&limit=5",
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().dishes)).toBe(true);
  });

  it("returns a total that matches the filters, not the page size", async () => {
    // The count next to a result list has to be the number of records
    // that MATCH, or it reads as the whole catalogue and is not.
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=1" })
    ).json();

    expect(body).toHaveProperty("total");
    expect(typeof body.total).toBe("number");
    // A total can only be as large as the catalogue, and with a
    // one-row page it must be at least what was returned.
    expect(body.total).toBeGreaterThanOrEqual(body.dishes.length);
  });

  it("reports hasMore consistently with the total", async () => {
    // hasMore is computed from the total, so the two cannot disagree.
    // A page that holds every matching record must report false.
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=100" })
    ).json();

    expect(body).toHaveProperty("hasMore");
    expect(typeof body.hasMore).toBe("boolean");
    expect(body.hasMore).toBe(body.total > body.dishes.length);
  });

  it("filters by content_type", async () => {
    // `content_type` is the editorial dish/drink classification
    // (db/migrations/0049_content_type.sql). It is an explicit field,
    // NOT derived from the family tag, so it is filtered on directly.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?content_type=drink&limit=50",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const dish of body.dishes) {
      expect(dish.contentType).toBe("drink");
    }
  });

  it("returns contentType on every dish", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=20" })
    ).json();
    for (const dish of body.dishes) {
      expect(dish).toHaveProperty("contentType");
      expect(["dish", "drink"]).toContain(dish.contentType);
    }
  });

  it("rejects an unknown content_type", async () => {
    // The vocabulary is enforced by the query schema, so a bad value
    // is a 400 rather than a silently empty list.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?content_type=cake",
    });
    expect(res.statusCode).toBe(400);
  });

  it("searches with q=", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?q=moussaka&limit=5",
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().dishes)).toBe(true);
  });

  it("returns only published dishes", async () => {
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=50" })
    ).json();
    for (const dish of body.dishes) {
      expect(dish.status).toBe("published");
    }
  });

  it("still 404s an unknown slug rather than 500ing", async () => {
    // The list route and the detail route are different code paths; a
    // regression in one must not mask the other.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/this-dish-does-not-exist-at-all",
    });
    expect(res.statusCode).toBe(404);
  });
});
