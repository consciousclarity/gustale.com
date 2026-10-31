/**
 * Integration test for GET /api/dishes (the LIST route).
 *
 * WHY THIS FILE EXISTS
 *
 * Until 2026-10-31, NO test ever called `GET /api/dishes`. Every
 * `/api/dishes` reference in the test suite was a `POST` (create) or a
 * `/api/dishes/:slug` call (read one). The list route itself was never
 * exercised.
 *
 * That is why a whole database column could go missing from the committed
 * migration chain without CI noticing. `GET /api/dishes` reads
 * `categories.kind`:
 *
 *     apps/api/src/routes/dishes.ts:275   AND c.kind = 'dish-type'
 *
 * and `categories.kind` existed in the LIVE database but in no committed
 * migration. A database built from the committed chain — which is what CI
 * builds — therefore had no such column, and the route returned HTTP 500.
 * The live site worked because the live database had the column; every
 * fresh environment was broken.
 *
 * These tests close that hole. They are the regression test for migration
 * 0035 (`db/migrations/0035_categories_kind.sql`), which restores the
 * column to the committed chain.
 *
 * WHAT IS COVERED
 *
 *   - GET /api/dishes returns 200 (the route does not 500)
 *   - the response has the list shape the web client expects
 *   - the dish-type category is resolved into familySlug/familyName
 *   - the `family=` filter works (it reads c.kind = 'family')
 *   - the `q=` search still works
 *   - the route returns only published dishes
 *   - an unknown path parameter is still a 404, not a 500
 *
 * Boot notes: the app is built in-process (no network) and uses the
 * DATABASE_URL from process.env — the same setup as the other integration
 * tests. The seed must have been applied for the content assertions.
 */

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

  it("resolves the dish-type category into familySlug and familyName", async () => {
    // This is the join that reads c.kind = 'dish-type'. The assertion is
    // that the query RAN (the route returned 200 and the dish carries the
    // family fields the /families page groups by) — not that a particular
    // slug is present, because the seed's category set differs between
    // the CI seed and a full local seed.
    const body = (
      await app.inject({ method: "GET", url: "/api/dishes?limit=20" })
    ).json();

    for (const dish of body.dishes) {
      expect(dish).toHaveProperty("familySlug");
      expect(dish).toHaveProperty("familyName");
    }
  });

  it("filters by family (reads c.kind = 'family')", async () => {
    // The `family=` filter matches on c4.kind = 'family'. If the column is
    // missing this is a 500, not an empty list — so assert on the status.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?family=moussaka&limit=5",
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().dishes)).toBe(true);
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
