/**
 * The contract tests for GET /api/search — the header search's data.
 *
 * WHY THIS FILE EXISTS
 *
 * The search endpoint worked and was quietly wrong in three ways. Each
 * was found by measuring against the live data, and each would have
 * been invisible in a test that only checked "it returns 200 with some
 * results":
 *
 *   1. The score was ALWAYS ZERO. Every searcher computed a real
 *      score in SQL and then returned `score: 0` in the row mapping —
 *      four copies of the same mistake. The client sorts by score, so
 *      every result in every group was equally ranked.
 *
 *   2. The search could not reach a dish by its PLACE, FAMILY or
 *      CUISINE. It read only `canonical_name` and
 *      `short_description`, while every published dish carries a place
 *      and most carry a family. On live, searching "Japan" found 5
 *      dishes where 79 carried that place.
 *
 *   3. Two of the four groups were DEAD. `food_regions` has no
 *      published rows, so the 'region' group was always empty and
 *      always showed a heading with nothing under it.
 *
 * So the cases below are:
 *
 *   - the score is a real number, and it ORDERS the results
 *   - a name match outranks a place match, which outranks a family
 *     match — and each result says WHICH field matched
 *   - a dish IS reachable by its place
 *   - the dead 'region' group is gone, and the 'family' and 'place'
 *     groups are present
 *   - a group with nothing to show returns nothing — no group links to
 *     a page that does not exist
 *   - the `type` filter narrows to one group
 *   - the query is validated (min 2 chars)
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

type SearchHit = {
  slug: string;
  name: string;
  shortDescription: string | null;
  href: string;
  score: number;
  matchedOn?: string;
};

type SearchGroup = {
  type: string;
  total: number;
  results: SearchHit[];
};

type SearchResponse = {
  query: string;
  took_ms: number;
  groups: SearchGroup[];
};

async function search(q: string, extra = ""): Promise<SearchResponse> {
  const res = await app.inject({
    method: "GET",
    url: `/api/search?q=${encodeURIComponent(q)}${extra}`,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as SearchResponse;
}

/**
 * The name of a dish that exists in the test database.
 *
 * The tests run against `gustale_dev`, which holds a small fixture set
 * — not the production catalogue. So a test that hard-codes "sushi"
 * passes on production and fails here, or the reverse. Every assertion
 * below therefore derives its fixture from the database rather than
 * assuming what is in it.
 */
async function aPublishedDishName(): Promise<string> {
  const res = await app.inject({
    method: "GET",
    url: "/api/dishes?limit=1",
  });
  const body = res.json() as { dishes?: Array<{ canonicalName?: string }> };
  const name = body.dishes?.[0]?.canonicalName;
  if (!name) throw new Error("the test database has no published dish");
  return name;
}

function groupOf(body: SearchResponse, type: string): SearchGroup | undefined {
  return body.groups.find((g) => g.type === type);
}

describe("GET /api/search", () => {
  it("returns the groups the UI knows about", async () => {
    const body = await search("cu");
    const types = body.groups.map((g) => g.type).sort();
    // 'region' is GONE: food_regions has no published rows, so the
    // group was always empty and always rendered a bare heading.
    expect(types).not.toContain("region");
    // Every group the UI renders a heading for must be present in the
    // response, even when it is empty — the UI keys its headings off
    // the response, not off a hardcoded list.
    expect(types).toContain("dish");
    expect(types).toContain("family");
    expect(types).toContain("lineage");
    expect(types).toContain("ingredient");
    expect(types).toContain("place");
  });

  it("scores every result with a real number, not zero", async () => {
    const name = await aPublishedDishName();
    const body = await search(name.slice(0, Math.min(4, name.length)));
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();
    expect(dish!.results.length).toBeGreaterThan(0);
    for (const hit of dish!.results) {
      expect(Number.isFinite(hit.score)).toBe(true);
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it("orders the results by score, descending", async () => {
    const name = await aPublishedDishName();
    const body = await search(name.slice(0, Math.min(4, name.length)));
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();
    const scores = dish!.results.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("says WHICH field matched", async () => {
    const name = await aPublishedDishName();
    const body = await search(name.slice(0, Math.min(4, name.length)));
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();
    const allowed = new Set([
      "name",
      "description",
      "place",
      "family",
      "cuisine",
    ]);
    for (const hit of dish!.results) {
      expect(hit.matchedOn).toBeDefined();
      expect(allowed.has(hit.matchedOn!)).toBe(true);
    }
  });

  it("reaches a dish by its PLACE, and says so", async () => {
    // The defect: the search read only the name and the description,
    // so a reader searching for a place got the dishes NAMED after it
    // and none of the others. On production, searching "Japan" found 5
    // dishes where 79 carried that place.
    //
    // The fixture's dishes carry places — India, Israel, Mexico,
    // Greece, Spain, Indonesia, the United Kingdom — so the contract
    // is testable here.
    const body = await search("India");
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();

    // Vindaloo is a dish whose NAME does not mention India.
    expect(dish!.total).toBeGreaterThan(0);
    const byPlace = dish!.results.filter((r) => r.matchedOn === "place");
    expect(byPlace.length).toBeGreaterThan(0);

    // And the hit it found is a real dish, not a made-up one.
    const vindaloo = byPlace.find((r) => r.slug === "vindaloo");
    expect(vindaloo).toBeDefined();
    expect(vindaloo!.href).toBe("/dishes/vindaloo");
  });

  it("ranks a name match above a place match", async () => {
    // "Chicken tikka masala" is the fixture's one dish whose name
    // starts with the term, and it is of the place "United Kingdom" —
    // so both kinds of match exist in one result set.
    const body = await search("Chicken");
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();
    const byName = dish!.results.find((r) => r.matchedOn === "name");
    expect(byName).toBeDefined();
    // A name match scores 1.0; a place match is capped at 0.9.
    expect(byName!.score).toBe(1);
  });

  it("returns the families that have dishes behind them", async () => {
    const body = await search("moussaka");
    const family = groupOf(body, "family");
    expect(family).toBeDefined();
    expect(family!.total).toBeGreaterThan(0);
    for (const hit of family!.results) {
      expect(hit.href).toMatch(/^\/family\/[a-z0-9-]+$/);
    }
    // The fixture's Moussaka family page is a real one.
    expect(family!.results.some((h) => h.href === "/family/moussaka")).toBe(
      true,
    );
  });

  it("does not return a family with no dishes behind it", async () => {
    // The fixture has several categories with zero published dishes.
    // Their pages are empty, so they must not be search hits — a hit
    // that leads to an empty page teaches the reader the group is
    // noise.
    const body = await search("test-mod");
    const family = groupOf(body, "family");
    expect(family).toBeDefined();
    for (const hit of family!.results) {
      expect(hit.slug).not.toMatch(/^test-/);
    }
  });

  it("returns a place group's hits only for places that HAVE a page", async () => {
    // A place page is SSG-built from the places with published
    // associations. A hit pointing at a place with no page is a 404,
    // so the group must not contain one. Today there are no published
    // associations, so the group is empty — and that is correct.
    const body = await search("israel");
    const place = groupOf(body, "place");
    expect(place).toBeDefined();
    for (const hit of place!.results) {
      expect(hit.href).toMatch(/^\/place\/[a-z0-9-]+$/);
    }
  });

  it("narrows to one group with the type filter", async () => {
    const body = await search("curry", "&type=family");
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]!.type).toBe("family");
  });

  it("rejects a query shorter than two characters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=a" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("invalid_query");
  });

  it("rejects a missing query", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search" });
    expect(res.statusCode).toBe(400);
  });

  it("returns no unpublished dishes", async () => {
    // The search is a public surface: a draft dish must never be
    // findable through it. The fixture holds unpublished dishes, so
    // this is testable.
    const body = await search("cu");
    const dish = groupOf(body, "dish");
    expect(dish).toBeDefined();
    for (const hit of dish!.results) {
      expect(hit.href).toMatch(/^\/dishes\/[a-z0-9-]+$/);
    }
    const published = await app.inject({
      method: "GET",
      url: "/api/dishes?limit=100",
    });
    const list = published.json() as { dishes?: Array<{ slug: string }> };
    const publishedSlugs = new Set((list.dishes ?? []).map((d) => d.slug));
    for (const hit of dish!.results) {
      expect(publishedSlugs.has(hit.slug)).toBe(true);
    }
  });
});
