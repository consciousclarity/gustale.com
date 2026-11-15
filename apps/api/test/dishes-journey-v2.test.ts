/**
 * Integration tests for the GUS-238 journey extensions.
 *
 * Covers the three behaviours the redesign brief requires and the
 * existing endpoint could not express:
 *
 *   1. `status` distinguishes a dish WITH a chronology from a dish with
 *      a RESEARCH GAP. They are different editorial statements.
 *   2. `movements` are returned ONLY when a row exists — and a row
 *      exists only when a historical source supports the claim. Chapter
 *      order and map proximity never produce one.
 *   3. `lineages` carry the editorial relationship (role, explanation,
 *      changed elements, confidence) and the related published dishes,
 *      so the page can present a real lineage section.
 *
 * Requires a seeded DB and the GUS-238 migration applied.
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

describe("GET /api/dishes/:slug/journey — GUS-238", () => {
  it("reports 'history' for a dish that has chapters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("history");
    expect(body.beats.length).toBeGreaterThan(0);
  });

  it("reports 'gap' for a dish with no verified chronology", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/gazpacho/journey",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("gap");
    expect(body.beats).toEqual([]);
  });

  it("never reports 'gap' for a dish that actually has chapters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    expect(body.status === "history").toBe(body.beats.length > 0);
  });

  it("returns an empty movements array when nothing supports a movement", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    expect(Array.isArray(body.movements)).toBe(true);
    // The seeded flagship dish has no movement rows, and no movement is
    // ever inferred from chapter order.
    expect(body.movements).toEqual([]);
  });

  it("returns the editorial fields on every beat", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    for (const beat of body.beats) {
      expect(beat).toHaveProperty("title");
      expect(beat).toHaveProperty("dateLabel");
      expect(beat).toHaveProperty("datePrecision");
      expect(beat).toHaveProperty("evidenceKind");
      expect(beat).toHaveProperty("locator");
      expect(beat).toHaveProperty("authors");
      expect(beat).toHaveProperty("placeRole");
      expect(beat).toHaveProperty("scopeNote");
      expect(Array.isArray(beat.bounds)).toBe(true);
      expect(Array.isArray(beat.regions)).toBe(true);
    }
  });

  it("keeps the confidence enum to its four existing values", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    for (const beat of body.beats) {
      expect(["documented", "likely", "possible", "parallel"]).toContain(
        beat.confidence,
      );
    }
  });

  it("returns lineage detail with the recorded role", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    for (const lineage of body.lineages) {
      expect(lineage).toHaveProperty("slug");
      expect(lineage).toHaveProperty("name");
      expect(lineage).toHaveProperty("role");
      expect(lineage).toHaveProperty("roleExplanation");
      expect(lineage).toHaveProperty("changedElements");
      expect(lineage).toHaveProperty("confidenceLevel");
      expect(Array.isArray(lineage.relatedDishes)).toBe(true);
    }
  });

  it("never lists the dish itself among its own related dishes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    const body = res.json();
    for (const lineage of body.lineages) {
      for (const dish of lineage.relatedDishes) {
        expect(dish.slug).not.toBe("vindaloo");
        expect(dish.isCurrent).toBe(false);
      }
    }
  });

  it("returns 404 for an unknown slug, not a gap", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/definitely-not-a-real-dish-xyz/journey",
    });
    expect(res.statusCode).toBe(404);
  });
});
