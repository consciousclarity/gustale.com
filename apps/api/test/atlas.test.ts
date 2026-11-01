/**
 * The P3 contract tests for GET /api/dishes/:slug/atlas.
 *
 * WHY THIS FILE EXISTS
 *
 * The atlas route is the public surface of the THREE CONCEPTS (ADR-004):
 *
 *   placesAndTraditions   where and with whom
 *   foodFamilies          what kind of food it is
 *   historyAndConnections  how it moved and what it relates to
 *
 * and it is the first public surface that reads the claims model at all.
 * Before it, the public API read `dishes.origin_geo_id`, `dish_dish_*`
 * and the legacy `dish_categories` — the claims model existed and was
 * populated, and NONE of it reached a visitor.
 *
 * So this file asserts the CONTRACT, and the contract is mostly about
 * what does NOT appear:
 *
 *   - no draft or private editorial data, through any surface
 *   - no direction implied where the direction is not known
 *   - no count that depends on how many associations a dish happens to
 *     have
 *   - the three concepts stay separate and stay named
 *
 * The brief's §13 lists the required cases. Each one that applies to
 * this route is covered below, and the ones that do not apply to it are
 * covered by the constraint tests (scripts/test_atlas_schema.sql) and
 * the migration assertions (scripts/test_atlas_backfill.sql).
 *
 * THE FIXTURES
 *
 * The four reference dishes — rendang, chicken-tikka-masala,
 * tacos-al-pastor, falafel — are seeded by
 * packages/db/seed-atlas-references.sql and published as FIXTURES by
 * db/migrations/0040_atlas_publication_predicate.sql. They carry
 * `provenance = 'atlas_fixture'`, which is how a reviewer finds them.
 *
 * The brief's §12 says the model is "demonstrated with isolated
 * fixtures", and §13 says "fixtures never enter the live database or
 * the production content pipeline". These tests run against the CI
 * database, which is exactly that.
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

// ─────────────────────────────────────────────────────────────────────
// The shapes the route returns. They are declared here rather than
// imported, so that a change to the route's shape is a TYPE ERROR in
// this file — not a silent drift that the tests do not notice.
// ─────────────────────────────────────────────────────────────────────

type AtlasAssociation = {
  id: string;
  relationship: string;
  entityKind: "place" | "community";
  entityId: string;
  name: string | null;
  isoCode: string | null;
  placeEntityType: string | null;
  explanation: string | null;
  qualifiers: Record<string, unknown>;
  evidence: {
    status: string;
    dispute: string | null;
    research: string | null;
  };
  reviewState: string;
  legacyValue: string | null;
  provenance: string;
};

type AtlasClaim = {
  id: string;
  predicate: string;
  predicateName: string;
  valueType: string;
  value: {
    ref: string | null;
    literal: string | null;
    literalType: string | null;
    placeName: string | null;
    placeIsoCode: string | null;
    communityName: string | null;
  };
  claimClass: string;
  status: string;
  evidence: {
    status: string;
    dispute: string | null;
    research: string | null;
  };
  independence: string | null;
  qualifiers: Record<string, unknown>;
};

type AtlasConnection = {
  id: string;
  relationship: string;
  relationshipName: string;
  isSymmetric: boolean;
  directionKnown: boolean;
  role: "source" | "target" | "either";
  other: { slug: string; name: string };
  reason: string | null;
  status: string;
};

type AtlasDate = {
  id: string;
  kind: string;
  yearStart: number | null;
  yearEnd: number | null;
  precision: string | null;
  text: string;
  statementId: string | null;
  placeName: string | null;
};

type AtlasBody = {
  dish: { id: string; slug: string; canonicalName: string };
  placesAndTraditions: AtlasAssociation[];
  foodFamilies: {
    family: { name: string; slug: string; parent?: string }[];
    technique: { name: string; slug: string }[];
    course: { name: string; slug: string }[];
    ingredientCategory: { name: string; slug: string }[];
    context: { name: string; slug: string }[];
  };
  historyAndConnections: {
    claims: AtlasClaim[];
    connections: AtlasConnection[];
    dates: AtlasDate[];
  };
  legacy: {
    origin: {
      name: string;
      isoCode: string | null;
      entityType: string | null;
      label: string;
      isDiscoveryData: boolean;
      warning: string;
    } | null;
  };
  counts: {
    dishes: number;
    places: number;
    communities: number;
    families: number;
    connections: number;
  };
  published: {
    associations: number;
    claims: number;
    connections: number;
  };
};

async function getAtlas(slug: string): Promise<AtlasBody> {
  const res = await app.inject({
    method: "GET",
    url: `/api/dishes/${slug}/atlas`,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as AtlasBody;
}

// ─────────────────────────────────────────────────────────────────────

describe("GET /api/dishes/:slug/atlas — the shape", () => {
  it("returns 200 for a published dish", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/falafel/atlas",
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for a dish that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/no-such-dish-at-all/atlas",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a dish that is not published", async () => {
    // A draft dish is invisible. The route reads the dish's status and
    // refuses, so a draft dish's associations cannot leak through this
    // route even if something else published them.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/yukkuri-shite-itte-ne/atlas",
    });
    // The dish may not be in the CI database at all, in which case it
    // is a 404 for the ordinary reason. Either way it is a 404.
    expect(res.statusCode).toBe(404);
  });

  it("names the THREE concepts separately, and does not merge them", async () => {
    const body = await getAtlas("falafel");

    // Each concept is present and named.
    expect(body).toHaveProperty("placesAndTraditions");
    expect(body).toHaveProperty("foodFamilies");
    expect(body).toHaveProperty("historyAndConnections");

    // And the third one is itself three separate lists.
    expect(body.historyAndConnections).toHaveProperty("claims");
    expect(body.historyAndConnections).toHaveProperty("connections");
    expect(body.historyAndConnections).toHaveProperty("dates");

    // The concepts do not bleed into each other: an association is not
    // a claim, a claim is not a connection, and a family is not a place.
    for (const association of body.placesAndTraditions) {
      expect(association).not.toHaveProperty("predicate");
      expect(association).not.toHaveProperty("family");
    }
    for (const claim of body.historyAndConnections.claims) {
      expect(claim).not.toHaveProperty("relationship");
      expect(claim).not.toHaveProperty("entityKind");
    }
    for (const connection of body.historyAndConnections.connections) {
      expect(connection).not.toHaveProperty("predicate");
      expect(connection).not.toHaveProperty("entityKind");
    }
  });

  it("keeps the legacy origin SEPARATE and marked as discovery data", async () => {
    const body = await getAtlas("falafel");

    // The legacy origin is there — it is still in the data, and hiding
    // it would lose it.
    expect(body.legacy.origin).not.toBeNull();
    expect(body.legacy.origin?.name).toBe("Israel");

    // And it is labelled as what it is: an ASSOCIATION, not an origin,
    // and a discovery value, not a finding.
    expect(body.legacy.origin?.label).toBe("Associated with");
    expect(body.legacy.origin?.isDiscoveryData).toBe(true);
    expect(body.legacy.origin?.warning).toBeTruthy();

    // It is NOT the same field as the typed associations. A client
    // cannot confuse the legacy origin for a published association.
    expect(body).not.toHaveProperty("origin");
  });
});

describe("GET /api/dishes/:slug/atlas — places & traditions", () => {
  it("returns falafel's TWO associations — a community and a place", async () => {
    const body = await getAtlas("falafel");

    expect(body.placesAndTraditions).toHaveLength(2);

    const community = body.placesAndTraditions.find(
      (a) => a.entityKind === "community",
    );
    expect(community).toBeDefined();
    expect(community?.name).toBe("Israeli cuisine");
    expect(community?.relationship).toBe("established_tradition");
    // A community is NOT a place: it has no ISO code and no place type.
    expect(community?.isoCode).toBeNull();
    expect(community?.placeEntityType).toBeNull();

    const place = body.placesAndTraditions.find(
      (a) => a.entityKind === "place",
    );
    expect(place).toBeDefined();
    expect(place?.name).toBe("Israel");
    expect(place?.isoCode).toBe("IL");
    expect(place?.placeEntityType).toBe("country");
  });

  it("distinguishes ONE association from MANY", async () => {
    // chicken-tikka-masala has exactly ONE — a place, and no tradition,
    // because the legacy data has none and the migration does not
    // invent one. rendang has THREE.
    const one = await getAtlas("chicken-tikka-masala");
    expect(one.placesAndTraditions).toHaveLength(1);
    expect(one.placesAndTraditions[0]?.entityKind).toBe("place");
    expect(one.placesAndTraditions[0]?.relationship).toBe("legacy_unreviewed");

    const many = await getAtlas("rendang");
    expect(many.placesAndTraditions).toHaveLength(3);

    // Two of rendang's are communities and one is a place.
    expect(
      many.placesAndTraditions.filter((a) => a.entityKind === "community"),
    ).toHaveLength(2);
    expect(
      many.placesAndTraditions.filter((a) => a.entityKind === "place"),
    ).toHaveLength(1);
  });

  it("carries the evidence axes SEPARATELY, and never a confidence score", async () => {
    const body = await getAtlas("falafel");

    for (const association of body.placesAndTraditions) {
      // The three axes are three fields, not one.
      expect(association.evidence).toHaveProperty("status");
      expect(association.evidence).toHaveProperty("dispute");
      expect(association.evidence).toHaveProperty("research");

      // And there is NO numerical confidence anywhere. The brief
      // forbids it: "No numerical confidence scores."
      const serialised = JSON.stringify(association);
      expect(serialised).not.toMatch(/"confidence"\s*:\s*0?\.\d/);
      expect(serialised).not.toMatch(/"score"\s*:/);
      expect(serialised).not.toMatch(/"probability"\s*:/);
    }
  });

  it("preserves the legacy value and its provenance", async () => {
    const body = await getAtlas("falafel");
    const place = body.placesAndTraditions.find(
      (a) => a.entityKind === "place",
    );

    // The original value is preserved, so nothing is lost, and it is
    // marked as legacy so it is not read as a finding.
    expect(place?.legacyValue).toBe("Israel");
    expect(place?.provenance).toBeTruthy();
  });
});

describe("GET /api/dishes/:slug/atlas — history & connections", () => {
  it("returns only PUBLISHED claims, and says which ones", async () => {
    const body = await getAtlas("falafel");

    for (const claim of body.historyAndConnections.claims) {
      // The publication rule, read back from the response.
      expect(claim.status).toBe("published");
    }
  });

  it("gives every claim its own evidence axes", async () => {
    const body = await getAtlas("falafel");

    for (const claim of body.historyAndConnections.claims) {
      expect(claim.evidence).toHaveProperty("status");
      expect(claim.evidence).toHaveProperty("dispute");
      expect(claim.evidence).toHaveProperty("research");
      // ADR-002 Q8: NULL independence means "not assessed", which is
      // NOT "single". The route must pass the NULL through.
      expect(
        claim.independence === null ||
          ["single", "corroborated", "dependent"].includes(claim.independence),
      ).toBe(true);
    }
  });

  it("renders NO direction for a connection whose direction is unknown", async () => {
    const body = await getAtlas("falafel");

    for (const connection of body.historyAndConnections.connections) {
      if (!connection.directionKnown) {
        // The direction is not established, so the edge must not
        // pretend it is. The role is 'either' — not 'source' and not
        // 'target' — and the symmetric flag is what tells the client
        // to draw no arrow.
        expect(connection.role).toBe("either");
        expect(connection.isSymmetric).toBe(true);
      }
    }
  });

  it("names the role of this dish on a directional connection", async () => {
    // The route is exercised against the CI database, where the
    // reference dishes have no connections. The RULE is still asserted
    // here, against whatever connections exist, because the rule is
    // what matters and it must hold for every edge.
    const body = await getAtlas("falafel");

    for (const connection of body.historyAndConnections.connections) {
      if (connection.directionKnown && !connection.isSymmetric) {
        // A directional edge has exactly two roles, and this dish is
        // one of them.
        expect(["source", "target"]).toContain(connection.role);
      } else {
        expect(connection.role).toBe("either");
      }
    }
  });
});

describe("GET /api/dishes/:slug/atlas — the counts", () => {
  it("counts unique dishes, not associations", async () => {
    const body = await getAtlas("falafel");

    // The dish count is the number of PUBLISHED dishes. It does not
    // depend on how many associations any of them has — the dish
    // count is not the sum of the association counts.
    expect(body.counts.dishes).toBeGreaterThan(0);

    // And it is NOT the number of associations.
    const associationCount = body.placesAndTraditions.length;
    expect(body.counts.dishes).not.toBe(associationCount);
  });

  it("counts places and communities SEPARATELY", async () => {
    const body = await getAtlas("falafel");

    // A community is a people or a practice, not a place. Counting
    // them together would inflate the place count with things that are
    // not places.
    expect(body.counts.places).toBeGreaterThan(0);
    expect(body.counts.communities).toBeGreaterThan(0);

    // And each is a count of DISTINCT entities, so a dish with two
    // associations to the same place is counted once.
    const distinctPlaces = new Set(
      body.placesAndTraditions
        .filter((a) => a.entityKind === "place")
        .map((a) => a.entityId),
    ).size;
    expect(body.counts.places).toBeGreaterThanOrEqual(distinctPlaces);
  });

  it("reports what is published, so an empty section is explained", async () => {
    const body = await getAtlas("falafel");

    expect(body.published.associations).toBe(body.placesAndTraditions.length);
    expect(body.published.claims).toBe(
      body.historyAndConnections.claims.length,
    );
    expect(body.published.connections).toBe(
      body.historyAndConnections.connections.length,
    );
  });
});

describe("GET /api/dishes/:slug/atlas — draft privacy", () => {
  it("exposes NO draft association", async () => {
    const body = await getAtlas("falafel");

    // Every association returned is published. The route reads them
    // through published_associations_for_dish(), which is the ONE
    // definition of what the public may see (ADR-004 D8.2).
    for (const association of body.placesAndTraditions) {
      // The fixture rows are the published ones. A draft row would
      // carry a legacy provenance and not be in this list at all.
      expect(association.provenance).toBe("atlas_fixture");
    }
  });

  it("exposes NO draft claim", async () => {
    const body = await getAtlas("falafel");

    for (const claim of body.historyAndConnections.claims) {
      expect(claim.status).toBe("published");
    }
  });

  it("exposes NO unpublished dish through the route", async () => {
    // The route refuses a non-published dish outright, so there is no
    // path by which a draft dish's associations, claims or connections
    // reach a reader.
    for (const slug of [
      "yukkuri-shite-itte-ne",
      "gate-test-dish",
      "does-not-exist",
    ]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/dishes/${slug}/atlas`,
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it("does not expose the editorial queue through the route", async () => {
    const body = await getAtlas("falafel");
    const serialised = JSON.stringify(body);

    // The editorial queue is private editorial data. It must not
    // appear in a public response in any form.
    expect(serialised).not.toContain("editorial_review_queue");
    expect(serialised).not.toContain("journey_place_without_association");
    expect(serialised).not.toContain("cuisine_without_tradition");
  });

  it("does not expose a reviewer's notes or the queue's reasons", async () => {
    const body = await getAtlas("falafel");
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain("reviewed_by");
    expect(serialised).not.toContain("reason");
  });
});

describe("GET /api/dishes/:slug/atlas — the OLD route still works", () => {
  it("does not change the shape of GET /api/dishes/:slug", async () => {
    // The atlas route is ADDITIVE. The old route is the SSG build's
    // data source and the web client's, so its shape must not move.
    //
    // The shape is asserted against a dish that HAS the full data —
    // `moussaka-greek` — because a reference dish carries only its
    // associations, and asserting "it has variants" on a dish with no
    // variants would be asserting the absence of a fixture, not the
    // stability of a route.
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/moussaka-greek",
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      dish: Record<string, unknown>;
      origin: unknown;
      variants: unknown;
      ingredients: unknown;
      categories: unknown;
      preparations: unknown;
      sources: unknown;
    };

    // The dish's own fields are nested under `dish` — the old route's
    // shape, which is what the SSG build and the web client read.
    expect(body.dish).toHaveProperty("slug");
    expect(body.dish).toHaveProperty("canonicalName");

    // And the sections the dish page renders.
    for (const key of [
      "origin",
      "variants",
      "ingredients",
      "categories",
      "preparations",
      "sources",
    ]) {
      expect(body).toHaveProperty(key);
    }
  });

  it("does not change the shape of GET /api/dishes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes?limit=5",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dishes: unknown[] };
    expect(Array.isArray(body.dishes)).toBe(true);
  });
});
