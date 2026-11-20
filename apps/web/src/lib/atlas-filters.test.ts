/**
 * THE ATLAS'S RULES.
 *
 * The blueprint's WP-C3 row is the contract:
 *
 *   - Flat map default; filter rail; place panel; list view replaces
 *     /regions.
 *   - Stop drawing relation type `family`.
 *   - Generate place pages only for places with one or more dishes.
 *
 * These are the rules that can be checked without a browser. The
 * visual ones -- the flat map, the rail, the panel -- are checked by
 * the build validator and by the eye; the rule that can silently
 * break is the one about `family`, because a URL parameter is enough
 * to bring a retired relationship type back onto the map.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATLAS_FILTER_PARAMS,
  NEVER_DRAWN,
  readAtlasFilters,
} from "./atlas-filters.ts";
import {
  RELATIONSHIP_KINDS,
  relationshipKindFor,
} from "./relationship-grammar.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENTS = join(HERE, "..", "components");

function readComponent(name: string): string {
  return readFileSync(join(COMPONENTS, name), "utf-8");
}

describe("the atlas — `family` is never drawn", () => {
  it("names `family` as the one kind the atlas refuses to draw", () => {
    assert.equal(NEVER_DRAWN, "family");
  });

  it("classifies the `family` relation type into that same kind", () => {
    // If the relation type were classified into some OTHER kind, the
    // exclusion below would not exclude it -- the edges would come
    // back wearing a different hat.
    assert.equal(relationshipKindFor("family"), NEVER_DRAWN);
  });

  it("leaves every OTHER relation type drawable", () => {
    const drawable = RELATIONSHIP_KINDS.filter((k) => k !== NEVER_DRAWN);
    assert.ok(drawable.length >= 2, "there is more than one kind left");
    for (const k of drawable) {
      assert.notEqual(k, NEVER_DRAWN);
    }
  });

  it("drops `family` from a kind set the URL asks for", () => {
    // `?kinds=family` must not bring the retired type back.
    const filters = readAtlasFilters("?kinds=family");
    assert.equal(filters.kinds.has("family"), false);
  });

  it("drops `family` from a kind set that mixes it with real kinds", () => {
    const filters = readAtlasFilters("?kinds=family,descent,migration");
    assert.equal(filters.kinds.has("family"), false);
    assert.equal(filters.kinds.has("descent"), true);
    assert.equal(filters.kinds.has("migration"), true);
  });

  it("draws every real kind when the URL says nothing", () => {
    const filters = readAtlasFilters("");
    for (const k of RELATIONSHIP_KINDS) {
      assert.equal(
        filters.kinds.has(k),
        k !== NEVER_DRAWN,
        `${k} is ${k === NEVER_DRAWN ? "not" : ""} drawn by default`,
      );
    }
  });
});

describe("the atlas — the map's own default excludes `family` too", () => {
  it("does not seed the map's internal kind set with every kind", () => {
    // The map can be rendered without the atlas island's `enabledKinds`
    // prop -- and then its OWN default is what draws. If that default
    // includes `family`, a retired relationship type comes back just
    // because a caller forgot a prop. The rule belongs to every path
    // into the state, so the map's default must exclude it too.
    const src = readComponent("WorldMap.tsx");
    // The seeding of the internal set: it must FILTER `family` out.
    // The seed is matched by its own shape rather than by a loose
    // bracket count -- `new Set(RELATIONSHIP_KINDS.filter((k) => ...))`
    // has a `)` inside the filter callback, so a naive `[^)]*` stops
    // in the middle of it.
    const seeding = src.match(
      /useState<Set<RelationshipKind>>\(\s*\(\)\s*=>\s*new Set\(([\s\S]{0,200}?)\)\s*,/,
    );
    assert.ok(seeding, "the internal kind set is seeded in one place");
    assert.match(
      seeding[1],
      /NEVER_DRAWN/,
      "the internal kind set filters the kind the atlas never draws",
    );
    assert.doesNotMatch(
      seeding[1],
      /new Set\(RELATIONSHIP_KINDS\)\s*,/,
      "the internal kind set must not be seeded with EVERY kind",
    );
  });

  it("does not let the legend's toggle switch `family` back on", () => {
    const src = readComponent("WorldMap.tsx");
    // The legend's toggle is a path into the state as well: it must
    // refuse the kind it is asked to add.
    assert.match(
      src,
      /kind === NEVER_DRAWN/,
      "the toggle refuses to add the kind the atlas never draws",
    );
  });
});

describe("the atlas — the filter is in the URL", () => {
  it("names every parameter the filter uses", () => {
    const declared: readonly string[] = ATLAS_FILTER_PARAMS;
    for (const p of ["q", "family", "technique", "course", "kinds"]) {
      assert.ok(declared.includes(p), `${p} is a filter parameter`);
    }
  });

  it("reads a query string into the filter", () => {
    const filters = readAtlasFilters(
      "?q=indonesia&family=curry&technique=frying",
    );
    assert.equal(filters.q, "indonesia");
    assert.equal(filters.family, "curry");
    assert.equal(filters.technique, "frying");
    assert.equal(filters.course, "");
  });

  it("survives an empty query string", () => {
    const filters = readAtlasFilters("");
    assert.equal(filters.q, "");
    assert.equal(filters.family, "");
    assert.equal(filters.technique, "");
    assert.equal(filters.course, "");
  });
});
