/**
 * The atlas's counts are DERIVED, not copied.
 *
 * THE DEFECT THIS TEST EXISTS FOR
 *
 * The capture carried a hand-maintained `counts` block. It went stale
 * the moment the capture was refreshed: the capture's own data said
 * 180 places and 108 communities, while the copied block still said
 * 0 and 0.
 *
 * A stale zero does not PRINT a zero. `AtlasHeroKpi.astro` renders a
 * metric only when its value is non-zero, so a stale zero SILENTLY
 * DROPS the metric rather than showing a wrong one. The failure is
 * invisible.
 *
 * WHAT IT COST, HONESTLY. As shipped, the two live consumers of these
 * counts read only `dishes` and `families`, which were never stale, so
 * no page shipped a wrong number: `AtlasHeroKpi.astro` is not mounted
 * anywhere, and the homepage reads `counts.dishes` and
 * `counts.families` only. The defect was a trap, not a visible
 * outage — the moment anyone mounts the KPI band or adds a
 * place/community figure, the zeroes would have silently swallowed two
 * real numbers (180 and 108) that the catalogue has.
 *
 * A copied number can disagree with the data it describes. A derived
 * number cannot. These tests assert the derivation, so the count and
 * the capture it describes cannot drift apart again.
 *
 * THE LIVE SEMANTICS. `apps/api/src/routes/atlas-counts.ts` counts
 * with SQL over the published dishes:
 *
 *   places      = count(DISTINCT a.entity_id) where entity_kind='place'
 *   communities = count(DISTINCT a.entity_id) where entity_kind='community'
 *   connections = the distinct UNDIRECTED pairs (LEAST/GREATEST)
 *
 * ENTITY IDENTITY, NOT NAMES. Two distinct entities may share a name
 * — the catalogue has two "China" and two "Luxembourg" — so counting
 * names reports 178 places where the live API reports 180. These
 * tests count entities, and they pin that difference so a future
 * "simplification" to names is caught.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// The test lives at `apps/web/src/lib/`, so the repo root is FOUR
// levels up: lib -> src -> web -> apps -> <repo root>.
const REPO = join(HERE, "..", "..", "..", "..");
const CAPTURE = join(REPO, "apps", "web", "scripts", "mock-api-data.json");
const MOCK = join(REPO, "apps", "web", "scripts", "mock-api.mjs");

interface Capture {
  atlas: Record<
    string,
    {
      placesAndTraditions?: {
        entityId?: string;
        entityKind?: string;
      }[];
    }
  >;
  connections?: {
    connections?: {
      from?: { id?: string; slug?: string };
      to?: { id?: string; slug?: string };
      fromDishId?: string;
      toDishId?: string;
      relationship?: string;
    }[];
  };
  places?: { places?: { name: string }[]; count?: number };
  counts?: { counts?: Record<string, number> };
  mapMeta?: { totalPublished?: number };
}

function capture(): Capture {
  return JSON.parse(readFileSync(CAPTURE, "utf-8")) as Capture;
}

/** The distinct entity ids of a kind — the live route's DISTINCT entity_id. */
function entityIds(data: Capture, kind: string): Set<string> {
  const ids = new Set<string>();
  for (const entry of Object.values(data.atlas ?? {})) {
    for (const assoc of entry?.placesAndTraditions ?? []) {
      if (assoc?.entityKind !== kind) continue;
      if (!assoc?.entityId) continue;
      ids.add(assoc.entityId);
    }
  }
  return ids;
}

/** The distinct UNDIRECTED pairs — the live route's LEAST/GREATEST normalisation. */
function undirectedPairs(data: Capture): Set<string> {
  const pairs = new Set<string>();
  for (const conn of data.connections?.connections ?? []) {
    const from = conn.from?.id ?? conn.from?.slug ?? conn.fromDishId;
    const to = conn.to?.id ?? conn.to?.slug ?? conn.toDishId;
    if (!from || !to) continue;
    const type = conn.relationship ?? "";
    const [a, b] = String(from) < String(to) ? [from, to] : [to, from];
    pairs.add(`${a}|${b}|${type}`);
  }
  return pairs;
}

describe("the atlas — the counts are derived from the capture, not copied", () => {
  it("derives the place count from DISTINCT entity ids, and it is 180", () => {
    const data = capture();
    const places = entityIds(data, "place");
    assert.equal(
      places.size,
      180,
      "the capture holds 180 distinct place entities",
    );
  });

  it("derives the community count from DISTINCT entity ids, and it is 108", () => {
    const data = capture();
    const communities = entityIds(data, "community");
    assert.equal(
      communities.size,
      108,
      "the capture holds 108 distinct community entities",
    );
  });

  it("counts places by identity, NOT by name", () => {
    // The distinction that makes the count 180 and not 178. Two
    // distinct entities share a name — "China" and "Luxembourg" — so
    // counting names would silently under-report by two, and the
    // number would disagree with the live API.
    const data = capture();
    const byName = new Set<string>();
    for (const entry of Object.values(data.atlas ?? {})) {
      for (const assoc of entry?.placesAndTraditions ?? []) {
        if (assoc?.entityKind !== "place") continue;
        const name = (assoc as unknown as { name?: string }).name;
        if (name) byName.add(name);
      }
    }
    assert.ok(
      byName.size < entityIds(data, "place").size,
      "counting names gives a SMALLER number than counting entities — that gap is the trap",
    );
  });

  it("derives the connection count as distinct UNDIRECTED pairs", () => {
    const data = capture();
    assert.equal(
      undirectedPairs(data).size,
      82,
      "the capture holds 82 distinct undirected connections",
    );
  });

  it("counts a pair connected twice under different types as TWO connections", () => {
    // The live route groups by `(a, b, relation_type)`, so two
    // relations between the same two dishes are two connections. The
    // capture agrees: 82 connections over 78 distinct dish pairs,
    // because four pairs are connected twice. Dropping the type from
    // the key would report 78 and silently disagree with the live
    // API by four.
    const data = capture();
    const pairsOnly = new Set<string>();
    for (const conn of data.connections?.connections ?? []) {
      const from = conn.from?.id ?? conn.from?.slug;
      const to = conn.to?.id ?? conn.to?.slug;
      if (!from || !to) continue;
      const [a, b] = String(from) < String(to) ? [from, to] : [to, from];
      pairsOnly.add(`${a}|${b}`);
    }
    assert.equal(pairsOnly.size, 78, "78 distinct dish pairs");
    assert.equal(
      undirectedPairs(data).size,
      82,
      "82 connections — the relationship type is part of the key",
    );
  });

  it("the captured counts block agrees with the derivation", () => {
    // The captured block is a FALLBACK for the dimension-table
    // counts. It must never contradict what the capture describes —
    // that contradiction is exactly what shipped the stale zeros.
    const data = capture();
    const captured = data.counts?.counts ?? {};
    assert.equal(
      captured.places,
      entityIds(data, "place").size,
      "the captured place count must match the derived one",
    );
    assert.equal(
      captured.communities,
      entityIds(data, "community").size,
      "the captured community count must match the derived one",
    );
  });
});

describe("the atlas — the mock derives rather than serves the copy", () => {
  it("the mock computes the counts instead of serving the captured block", () => {
    const src = readFileSync(MOCK, "utf-8");
    assert.match(
      src,
      /function deriveCounts\(\)/,
      "the mock derives the counts from the capture",
    );
    assert.match(
      src,
      /const COUNTS = deriveCounts\(\)/,
      "the route serves the DERIVED counts",
    );
  });

  it("the derivation counts DISTINCT entity ids, and never the names", () => {
    const src = readFileSync(MOCK, "utf-8");
    assert.match(src, /entityId/, "the derivation counts entity identity");
    assert.match(
      src,
      /entity_kind|entityKind/,
      "the derivation separates places from communities",
    );
  });

  it("a derived number always wins over the copied one", () => {
    // The copy is the thing that went stale. If the captured block
    // were allowed to override the derivation, the stale zeros would
    // come straight back.
    const src = readFileSync(MOCK, "utf-8");
    const assign = src.match(
      /if \(placeIds\.size > 0\) counts\.places = placeIds\.size;/,
    );
    assert.ok(assign, "the derived place count overwrites the captured one");
    const override = src.match(/counts\.places\s*=\s*captured\.counts\.places/);
    assert.equal(
      override,
      null,
      "the captured count must never override the derived one",
    );
  });

  it("the counts are read after CONNECTIONS is initialised", () => {
    // A `const` cannot be read before its declaration is evaluated.
    // Calling `deriveCounts()` before `CONNECTIONS` is initialised
    // throws "Cannot access 'CONNECTIONS' before initialization" — and
    // the mock dies at startup, so every build that uses it fails.
    const src = readFileSync(MOCK, "utf-8");
    const connectionsAt = src.indexOf("const CONNECTIONS =");
    const countsAt = src.indexOf("const COUNTS = deriveCounts();");
    assert.ok(connectionsAt > 0, "CONNECTIONS is declared");
    assert.ok(countsAt > 0, "COUNTS is assigned");
    assert.ok(
      countsAt > connectionsAt,
      "COUNTS is assigned AFTER CONNECTIONS — the derivation reads it",
    );
  });
});
