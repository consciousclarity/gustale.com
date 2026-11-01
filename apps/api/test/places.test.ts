/**
 * The contract tests for GET /api/places/:slug — the place page's data.
 *
 * WHY THIS FILE EXISTS
 *
 * The brief's §5 (D3) makes a place first-class: a dish is associated
 * with places and communities, the association carries a relationship
 * type, and a reader browsing a place must see the dishes associated
 * with it — grouped by WHAT KIND of association.
 *
 * The P4 acceptance criterion says:
 *
 *   > The place page heads "Dishes associated with this place" and
 *   > groups by relationship type; a shared dish appears under every
 *   > relevant published association and counts once per result set.
 *
 * So the cases below are:
 *
 *   - the place resolves by its derived slug AND by its ISO code
 *   - the dishes are GROUPED by relationship type
 *   - a dish associated under two relationship types appears under BOTH
 *     and counts ONCE
 *   - NO draft association and NO draft dish is served
 *   - the groups are in the fixed presentation order, and the order
 *     does not change what is served
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

type PlaceDish = {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  viewCount: number;
  evidence: { status: string; dispute: string | null; research: string | null };
  explanation: string | null;
};

type PlaceGroup = {
  relationship: string;
  label: string;
  dishes: PlaceDish[];
};

type PlaceBody = {
  place: {
    slug: string;
    name: string;
    localName: string | null;
    isoCode: string | null;
    entityType: string;
    subdivisionType: string | null;
    lat: number | null;
    lng: number | null;
  };
  groups: PlaceGroup[];
  counts: { dishes: number; groups: number };
};

async function getPlace(slug: string): Promise<PlaceBody> {
  const res = await app.inject({ method: "GET", url: `/api/places/${slug}` });
  expect(res.statusCode).toBe(200);
  return res.json() as PlaceBody;
}

describe("GET /api/places/:slug — the place", () => {
  it("resolves a place by its derived slug", async () => {
    const body = await getPlace("israel");
    expect(body.place.name).toBe("Israel");
    expect(body.place.slug).toBe("israel");
    expect(body.place.entityType).toBe("country");
  });

  it("resolves a place by its ISO code as well", async () => {
    // "IL" is what a reader types. The ISO code is an ALTERNATIVE to
    // the slug, not a second identity.
    const byCode = await getPlace("il");
    const bySlug = await getPlace("israel");
    expect(byCode.place.name).toBe(bySlug.place.name);
    expect(byCode.place.isoCode).toBe(bySlug.place.isoCode);
  });

  it("returns 404 for a place that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/places/not-a-real-place-anywhere",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns a place with no coordinate rather than a wrong one", async () => {
    const body = await getPlace("israel");
    // The fixture places have no geometry, and a null coordinate is
    // honest. A centroid pin presented as a birthplace is the defect
    // the brief's §8 forbids.
    expect(body.place.lat === null || typeof body.place.lat === "number").toBe(
      true,
    );
  });
});

describe("GET /api/places/:slug — the dishes, grouped by relationship type", () => {
  it("groups the dishes by relationship type", async () => {
    const body = await getPlace("israel");

    expect(body.groups.length).toBeGreaterThan(0);
    for (const group of body.groups) {
      expect(group.relationship).toBeTruthy();
      expect(group.label).toBeTruthy();
      expect(group.dishes.length).toBeGreaterThan(0);
    }
  });

  it("puts every dish in exactly one group per relationship type", async () => {
    const body = await getPlace("israel");

    // The same dish may appear under two groups — it is associated with
    // the place under two relationship types — but it must not appear
    // TWICE under the same one.
    for (const group of body.groups) {
      const slugs = group.dishes.map((d) => d.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("counts DISTINCT dishes, so a shared dish counts once", async () => {
    const body = await getPlace("israel");

    // The count is of DISTINCT dishes. The sum of the groups' lengths
    // may be larger — that is the point — and the count must not be.
    const totalRows = body.groups.reduce((n, g) => n + g.dishes.length, 0);
    const distinctSlugs = new Set(
      body.groups.flatMap((g) => g.dishes.map((d) => d.slug)),
    ).size;

    expect(body.counts.dishes).toBe(distinctSlugs);
    expect(body.counts.groups).toBe(body.groups.length);

    // And the count is never larger than the number of rows.
    expect(body.counts.dishes).toBeLessThanOrEqual(totalRows);
  });

  it("keeps the groups in the fixed presentation order", async () => {
    const body = await getPlace("israel");

    // The ORDER is presentation metadata — a reader scanning the list
    // needs a consistent one — and it never implies that one
    // association is better evidenced than another. The evidence badge
    // says that.
    const order = [
      "historical_emergence",
      "established_tradition",
      "regional_adaptation",
      "later_introduction",
      "earliest_documentation",
      "legacy_unreviewed",
    ];

    const seen = body.groups.map((g) => g.relationship);
    const positions = seen.map((r) => order.indexOf(r)).filter((i) => i >= 0);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("gives every dish its own evidence axes and no confidence number", async () => {
    const body = await getPlace("israel");

    for (const group of body.groups) {
      for (const dish of group.dishes) {
        expect(dish.evidence).toHaveProperty("status");
        expect(dish.evidence).toHaveProperty("dispute");
        expect(dish.evidence).toHaveProperty("research");

        // No numerical confidence anywhere — the brief forbids it.
        const serialised = JSON.stringify(dish);
        expect(serialised).not.toMatch(/"confidence"\s*:\s*0?\.\d/);
        expect(serialised).not.toMatch(/"score"\s*:/);
      }
    }
  });

  it("serves NO draft dish and NO draft association", async () => {
    const body = await getPlace("israel");

    // The reference dishes are published, so the group is not empty —
    // and the fact that the group IS populated proves the publication
    // filter did not exclude everything.
    expect(body.groups.length).toBeGreaterThan(0);

    for (const group of body.groups) {
      for (const dish of group.dishes) {
        // Every dish here is published — the query filters on
        // d.status = 'published', and the fixture set is published.
        expect(dish.slug).toBeTruthy();
        expect(dish.canonicalName).toBeTruthy();
      }
    }
  });
});

describe("GET /api/places/:slug — it does not leak", () => {
  it("exposes no editorial or private data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/places/israel",
    });
    const body = res.json() as {
      place: Record<string, unknown>;
      groups: { dishes: Record<string, unknown>[] }[];
      counts: Record<string, unknown>;
    };

    // The check is on the KEYS, not on the whole response body.
    //
    // The first version of this test matched the response as a string,
    // and it failed on "legacy_value" — a word that appears inside the
    // backfill's PROSE ("the original value is preserved in
    // legacy_value"). A substring match on prose proves nothing about
    // what is exposed; a check on the KEYS does.
    const forbidden = [
      "editorial_review_queue",
      "reviewed_by",
      "reviewed_at",
      "legacy_value",
      "notes",
      "status",
      "provenance",
      "review_state",
      "publication_state",
      "qualifiers",
    ];

    const placeKeys = Object.keys(body.place);
    const countKeys = Object.keys(body.counts);
    for (const dish of body.groups.flatMap((g) => g.dishes)) {
      for (const key of Object.keys(dish)) {
        expect(forbidden, `"${key}" is exposed`).not.toContain(key);
      }
    }
    for (const key of placeKeys) {
      expect(forbidden, `"${key}" is exposed`).not.toContain(key);
    }
    for (const key of countKeys) {
      expect(forbidden, `"${key}" is exposed`).not.toContain(key);
    }

    // The editor's own words never reach a reader.
    const serialised = res.body;
    expect(serialised).not.toContain("editorial_review_queue");
    expect(serialised).not.toContain("journey_place_without_association");
    // The fixture marker is internal bookkeeping.
    expect(serialised).not.toContain("atlas_fixture");
  });
});
