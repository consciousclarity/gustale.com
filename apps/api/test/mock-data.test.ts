/**
 * The contract test that fails when the CI MOCKS and the live schema
 * diverge.
 *
 * WHY THIS FILE EXISTS
 *
 * The Astro build runs against `apps/web/scripts/mock-api-data.json`, a
 * CAPTURE of the live API. So the build proves the pages render — but
 * only against whatever the mock happened to contain.
 *
 * The mock was captured on 2026-07-25 with **121 dishes** against
 * **1,474** live. Every build since then proved that 121 dishes
 * rendered correctly, and said nothing about the other 1,353. Stale
 * mocks pass silently: the build is green, the pages are baked, and
 * the drift is invisible until a reader hits a dish that is not in the
 * mock.
 *
 * And the drift was not only in the COUNT. The capture walked the
 * MAP endpoint's slugs, and `/api/dishes/map` returns only the dishes
 * that HAVE A GEOMETRY — it filters on `origin_location IS NOT NULL`,
 * because a dot on a map needs a coordinate. On the live catalogue that
 * is 121 of 1,474.
 *
 * So the mock carried 121 details against 1,474 list entries, and the
 * SSG build baked 1,353 EMPTY pages. The capture looked successful
 * because the script compared the details against the MAP's count.
 *
 * These tests assert the contract, and they are the check that the
 * brief's §13 asks for: "a contract test fails when mocks and live
 * schema diverge".
 *
 * WHAT IS ASSERTED
 *
 *   1. The mock's list and the mock's details cover the SAME dishes.
 *      Every listed dish has a detail, and there is no detail without a
 *      list entry. This is the check that would have caught the
 *      121-of-1,474 capture.
 *   2. The mock's map is the SUBSET of the list that has geometry —
 *      never a superset, and never a dish the list does not have.
 *   3. The mock's dish DETAIL SHAPE matches the live API's: the keys
 *      the API returns are the keys the mock carries.
 *   4. The mock's captured-at stamp is present, so a stale mock is
 *      identifiable.
 *   5. The mock's counts are CONSISTENT with each other — the number
 *      the mock claims in its stamp is the number it holds.
 *
 * WHAT IS NOT ASSERTED
 *
 * The mock's dish count against LIVE. The mock is a capture of a
 * moment, and a capture taken yesterday is not wrong today — it is
 * simply old. Asserting against live here would make the test depend
 * on a network call and on production's exact count, which changes
 * every time a dish is published.
 *
 * The INTERNAL consistency is what can be asserted without a network
 * call, and it is the thing that was broken.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const MOCK_DATA_PATH = join(
  here,
  "..",
  "..",
  "web",
  "scripts",
  "mock-api-data.json",
);

type MockDish = {
  slug: string;
  canonicalName?: string;
  [key: string]: unknown;
};

type MockData = {
  generatedFrom?: string;
  list?: MockDish[];
  map?: MockDish[];
  details?: Record<string, unknown>;
  atlas?: Record<string, unknown>;
  counts?: { counts?: Record<string, number>; definitions?: unknown } | null;
  connections?: {
    connections?: {
      id: string;
      relationship: string;
      relationshipName: string;
      from: { slug: string; lat: number | null; lng: number | null };
      to: { slug: string; lat: number | null; lng: number | null };
    }[];
    count?: number;
    byRelationship?: Record<string, number>;
  } | null;
};

const mock = JSON.parse(readFileSync(MOCK_DATA_PATH, "utf-8")) as MockData;
const LIST = mock.list ?? [];
const MAP = mock.map ?? [];
const DETAILS = mock.details ?? {};
const ATLAS = mock.atlas ?? {};
const COUNTS = mock.counts ?? null;
const CONNECTIONS = mock.connections ?? null;

// ─────────────────────────────────────────────────────────────────────

describe("the CI mock data — the list and the details agree", () => {
  it("has a list and a map and a details object", () => {
    expect(Array.isArray(mock.list)).toBe(true);
    expect(Array.isArray(mock.map)).toBe(true);
    expect(typeof mock.details).toBe("object");
    expect(LIST.length).toBeGreaterThan(0);
  });

  it("records where it was captured and when", () => {
    // A mock with no stamp cannot be aged, and a mock that cannot be
    // aged cannot be scheduled for a refresh.
    expect(typeof mock.generatedFrom).toBe("string");
    expect(mock.generatedFrom?.length).toBeGreaterThan(0);
    expect(mock.generatedFrom).toContain("captured");
  });

  it("has a detail for EVERY listed dish", () => {
    // THE CHECK THAT MATTERS.
    //
    // The SSG build bakes a page per dish. A listed dish with no
    // detail is a page with no content — and the capture looked
    // successful because it compared the details against the MAP's
    // count, which is only the dishes with geometry.
    const withoutDetail = LIST.filter((d) => !(d.slug in DETAILS)).map(
      (d) => d.slug,
    );
    expect(withoutDetail).toEqual([]);
  });

  it("has no detail without a list entry", () => {
    // The other direction: a detail for a dish the list does not have
    // is a dish the site does not know about, and the two counts
    // disagreeing is the same bug from the other side.
    const listSlugs = new Set(LIST.map((d) => d.slug));
    const orphaned = Object.keys(DETAILS).filter(
      (slug) => !listSlugs.has(slug),
    );
    expect(orphaned).toEqual([]);
  });

  it("has one detail per listed dish — no duplicates, no gaps", () => {
    expect(Object.keys(DETAILS).length).toBe(LIST.length);
  });

  it("lists every dish once", () => {
    const slugs = LIST.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("the CI mock data — the map is the subset with geometry", () => {
  it("contains only dishes the list has", () => {
    const listSlugs = new Set(LIST.map((d) => d.slug));
    const extra = MAP.filter((d) => !listSlugs.has(d.slug)).map((d) => d.slug);
    expect(extra).toEqual([]);
  });

  it("contains only dishes that HAVE a detail", () => {
    const withoutDetail = MAP.filter((d) => !(d.slug in DETAILS)).map(
      (d) => d.slug,
    );
    expect(withoutDetail).toEqual([]);
  });

  it("is no LARGER than the list", () => {
    // The map holds the dishes with geometry, so it is a SUBSET. A map
    // larger than the list would mean the capture and the map came
    // from different moments.
    expect(MAP.length).toBeLessThanOrEqual(LIST.length);
  });

  it("carries a coordinate on every dish it holds", () => {
    // A dot on a map needs a coordinate. A map entry without one is a
    // dish that cannot be drawn.
    for (const dish of MAP) {
      expect(typeof dish.lat).toBe("number");
      expect(typeof dish.lng).toBe("number");
    }
  });
});

describe("the CI mock data — the detail shape matches the live API", () => {
  it("carries the keys the API's dish response carries", () => {
    // The keys the web client reads. If the API's shape moves and the
    // mock does not, the build renders against a shape that no longer
    // exists — and it passes, because the mock is what the build sees.
    //
    // The list is a capture of the same response, so one dish from it
    // is enough to state the contract.
    const first = DETAILS[LIST[0]?.slug ?? ""] as
      | Record<string, unknown>
      | undefined;
    expect(first).toBeDefined();

    for (const key of ["dish", "variants", "ingredients", "categories"]) {
      expect(first).toHaveProperty(key);
    }

    // The dish's own fields are nested under `dish`.
    const dish = first?.dish as Record<string, unknown> | undefined;
    expect(dish).toBeDefined();
    for (const key of ["slug", "canonicalName", "shortDescription"]) {
      expect(dish).toHaveProperty(key);
    }
  });

  it("gives every detail the same key set as the first", () => {
    // A capture that dropped a section for one dish would bake a page
    // missing it, and the build would pass.
    const reference = Object.keys(
      DETAILS[LIST[0]?.slug ?? ""] as Record<string, unknown>,
    ).sort();
    expect(reference.length).toBeGreaterThan(0);

    const mismatched: string[] = [];
    for (const dish of LIST) {
      const detail = DETAILS[dish.slug] as Record<string, unknown> | undefined;
      if (!detail) {
        mismatched.push(`${dish.slug} (missing)`);
        continue;
      }
      const keys = Object.keys(detail).sort();
      if (keys.join(",") !== reference.join(",")) {
        mismatched.push(dish.slug);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("gives every detail the same dish-level key set as the first", () => {
    const referenceDish = Object.keys(
      (DETAILS[LIST[0]?.slug ?? ""] as { dish?: Record<string, unknown> })
        .dish ?? {},
    ).sort();

    const mismatched: string[] = [];
    for (const dish of LIST) {
      const detail = DETAILS[dish.slug] as
        | { dish?: Record<string, unknown> }
        | undefined;
      const keys = Object.keys(detail?.dish ?? {}).sort();
      if (keys.join(",") !== referenceDish.join(",")) {
        mismatched.push(dish.slug);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe("the CI mock data — the ATLAS data is present and consistent", () => {
  it("carries an atlas entry for every listed dish", () => {
    // The atlas route is /api/dishes/:slug/atlas — a DIFFERENT path from
    // the dish detail — so the capture has to fetch it separately. If
    // it does not, a P4 build against this mock silently bakes dishes
    // with no associations and no claims.
    //
    // This is the same class of bug as the 1,353 empty pages, one phase
    // later.
    const missing = LIST.filter((d) => !(d.slug in ATLAS)).map((d) => d.slug);
    expect(missing).toEqual([]);
  });

  it("gives every atlas entry the same key set", () => {
    const reference = Object.keys(
      ATLAS[LIST[0]?.slug ?? ""] as Record<string, unknown>,
    ).sort();
    expect(reference.length).toBeGreaterThan(0);

    const mismatched: string[] = [];
    for (const dish of LIST) {
      const entry = ATLAS[dish.slug] as Record<string, unknown> | undefined;
      if (!entry) {
        mismatched.push(`${dish.slug} (missing)`);
        continue;
      }
      if (Object.keys(entry).sort().join(",") !== reference.join(",")) {
        mismatched.push(dish.slug);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("carries the THREE concepts in every atlas entry", () => {
    // The three concepts are separate and NAMED (ADR-004). A mock whose
    // atlas entries lack them would bake a page with none of them.
    for (const dish of LIST.slice(0, 50)) {
      const entry = ATLAS[dish.slug] as Record<string, unknown> | undefined;
      expect(entry).toBeDefined();
      expect(entry).toHaveProperty("placesAndTraditions");
      expect(entry).toHaveProperty("foodFamilies");
      expect(entry).toHaveProperty("historyAndConnections");
    }
  });

  it("carries the PLACES, so the place page has its static paths", () => {
    // The place page's static paths come from /api/places. A mock
    // WITHOUT the key produces NO /place/* pages at all — and a build
    // that silently produces no pages for a page type is the same
    // failure as the stale mock, one level up.
    //
    // The KEY must be present. The LIST may be empty — on live there
    // are no published associations, so there are no places to browse,
    // and that is the truth rather than a gap.
    expect(mock, "the mock has no 'places' key").toHaveProperty("places");
    const places = mock.places as { places?: unknown[]; count?: number } | null;
    expect(places).not.toBeNull();
    expect(Array.isArray(places?.places)).toBe(true);
    expect(places?.count).toBe(places?.places?.length ?? 0);
  });

  it("carries the CONNECTIONS, so the map draws its edges", () => {
    // The map's edges come from /api/atlas/connections. A mock
    // WITHOUT the key bakes a map with no relationships at all — and
    // because the build does not fail on an empty edge set, that
    // silence is invisible: the page looks fine and simply has
    // nothing on it.
    //
    // The connections must also be CONSISTENT with the map's dishes:
    // an edge to a dish the map does not draw points at nothing.
    expect(mock, "the mock has no 'connections' key").toHaveProperty(
      "connections",
    );
    expect(CONNECTIONS).not.toBeNull();
    const edges = CONNECTIONS?.connections ?? [];
    expect(Array.isArray(edges)).toBe(true);
    expect(CONNECTIONS?.count).toBe(edges.length);

    // every edge's endpoints must be dishes the map holds
    //
    // The map is a FLAT LIST of dishes, not an object with a 'dishes'
    // key.
    const mapSlugs = new Set(
      (mock.map as { slug: string }[] | null)?.map((d) => d.slug) ?? [],
    );
    expect(mapSlugs.size, "the map holds no dishes at all").toBeGreaterThan(0);
    for (const edge of edges) {
      expect(
        mapSlugs.has(edge.from.slug),
        `the edge to "${edge.from.slug}" points at a dish the map does not draw`,
      ).toBe(true);
      expect(
        mapSlugs.has(edge.to.slug),
        `the edge to "${edge.to.slug}" points at a dish the map does not draw`,
      ).toBe(true);
    }

    // and the relation types must be countable
    const byRelationship = CONNECTIONS?.byRelationship ?? {};
    const summed = Object.values(byRelationship).reduce((a, b) => a + b, 0);
    expect(summed).toBe(edges.length);
  });

  it("carries the DEFINED COUNTS, with a definition per count", () => {
    // The homepage's statistics come from these (ADR-004 F7). A mock
    // without them would bake the old undefined numbers.
    expect(COUNTS).not.toBeNull();
    expect(COUNTS?.counts).toBeDefined();
    expect(COUNTS?.definitions).toBeDefined();

    const counts = (COUNTS?.counts ?? {}) as Record<string, number>;
    for (const key of ["dishes", "places", "communities", "families"]) {
      expect(counts[key], `"${key}" is missing`).toBeGreaterThanOrEqual(0);
    }

    const definitions = (COUNTS?.definitions ?? {}) as Record<string, string>;
    for (const key of Object.keys(counts)) {
      expect(definitions[key], `"${key}" has no definition`).toBeTruthy();
    }
  });

  it("the counts dish count agrees with the list", () => {
    const counts = (COUNTS?.counts ?? {}) as Record<string, number>;
    expect(counts.dishes).toBe(LIST.length);
  });
});

describe("the CI mock data — the counts agree with the stamp", () => {
  it("claims the number of dishes it holds", () => {
    // The stamp says "N published dishes"; the file must hold N. A
    // stamp that disagrees with the file is a stamp nobody can trust,
    // and it is how a 121-dish capture passed as a 1,474-dish one.
    const match = mock.generatedFrom?.match(
      /live, (\d+) published dishes, (\d+) of them with geometry/,
    );
    expect(match).not.toBeNull();

    const claimedDishes = Number(match?.[1]);
    const claimedMap = Number(match?.[2]);

    expect(claimedDishes).toBe(LIST.length);
    expect(claimedMap).toBe(MAP.length);
  });
});
