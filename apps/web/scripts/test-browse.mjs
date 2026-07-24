#!/usr/bin/env node
/**
 * Focused unit tests for U0-C browse helpers.
 * Run: node --test scripts/test-browse.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  absoluteDishesIndexHref,
  appendDishes,
  applyBrowseFilter,
  applyLineageFilter,
  browseFiltersKey,
  buildBrowseQuery,
  buildCountryDirectory,
  buildFamilyDirectory,
  buildLineageQuery,
  clearBrowseFilters,
  clearLineageFilters,
  countryAlphaIndex,
  countryMatchesExact,
  filterChipsFor,
  filterCountryDirectory,
  filterFamilyDirectory,
  hasMorePages,
  loadedPageFromCount,
  mapBrowseHref,
  pageOffset,
  parseBrowseState,
  parseLineageFilters,
  parseStructuredTokens,
  planHistoryRestore,
  recoveryLinks,
  removeBrowseChip,
  removeLineageChip,
  safeQueryEncode,
  serializeBrowseState,
  sliceDishesToPage,
} from "./browse-helpers.mjs";

describe("parse/serialize browse state", () => {
  it("round-trips query + filters and drops empties", () => {
    const state = parseBrowseState({
      q: " pho ",
      country: "Japan",
      page: "2",
      junk: "x",
    });
    assert.equal(state.q, "pho");
    assert.equal(state.country, "Japan");
    assert.equal(state.page, 2);
    const sp = serializeBrowseState(state);
    assert.equal(sp.get("q"), "pho");
    assert.equal(sp.get("country"), "Japan");
    assert.equal(sp.get("page"), "2");
    assert.equal(buildBrowseQuery(state), "?q=pho&country=Japan&page=2");
  });

  it("restores defaults safely", () => {
    const state = parseBrowseState({});
    assert.equal(state.page, 1);
    assert.equal(buildBrowseQuery(state), "");
  });
});

describe("structured tokens + filter removal", () => {
  it("parses legacy structured tokens without dominating free text", () => {
    const partial = parseStructuredTokens(
      "ramen country:Italy technique:grilling",
    );
    assert.equal(partial.q, "ramen");
    assert.equal(partial.country, "Italy");
    assert.equal(partial.technique, "grilling");
  });

  it("removes chips and clears all", () => {
    const base = parseBrowseState({ q: "x", country: "Japan", page: "3" });
    const next = removeBrowseChip(base, "country");
    assert.equal(next.country, null);
    assert.equal(next.page, 1);
    assert.equal(next.q, "x");
    assert.ok(filterChipsFor(base).some((c) => c.stateKey === "country"));
    assert.equal(clearBrowseFilters().page, 1);
  });
});

describe("result filtering", () => {
  const dishes = [
    {
      id: "1",
      slug: "vindaloo",
      canonicalName: "Vindaloo",
      originName: "India",
      familySlug: "stew",
      familyName: "Stews",
      shortDescription: "Hot curry",
    },
    {
      id: "2",
      slug: "sushi",
      canonicalName: "Sushi",
      originName: "Japan",
      familySlug: "rice-dish",
      familyName: "Rice dishes",
      shortDescription: "Vinegared rice",
    },
    {
      id: "3",
      slug: "burger",
      canonicalName: "Hamburger",
      originName: "United States",
      familySlug: "sandwich",
      familyName: "Sandwich",
      shortDescription: "Patton",
    },
  ];

  it("filters by free text and structured country", () => {
    assert.equal(
      applyBrowseFilter(dishes, parseBrowseState({ q: "sushi" })).length,
      1,
    );
    assert.equal(
      applyBrowseFilter(dishes, parseBrowseState({ country: "india" })).length,
      1,
    );
  });

  it("uses exact case-insensitive country matching", () => {
    assert.equal(countryMatchesExact("United States", "united states"), true);
    assert.equal(countryMatchesExact("United States", "United"), false);
    assert.equal(
      applyBrowseFilter(dishes, parseBrowseState({ country: "United" })).length,
      0,
    );
    assert.equal(
      applyBrowseFilter(dishes, parseBrowseState({ country: "united states" }))
        .length,
      1,
    );
  });
});

describe("pagination append/dedupe/offset", () => {
  it("computes offsets and appends without duplicates", () => {
    assert.equal(pageOffset(1, 24), 0);
    assert.equal(pageOffset(2, 24), 24);
    const merged = appendDishes(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    );
    assert.deepEqual(
      merged.map((d) => d.id),
      ["a", "b", "c"],
    );
    assert.equal(hasMorePages(24, 24), true);
    assert.equal(hasMorePages(10, 24), false);
  });

  it("complete append/dedupe across pages reaches unique total", () => {
    const pageSize = 24;
    const all = Array.from({ length: 60 }, (_, i) => ({
      id: `id-${i}`,
      slug: `slug-${i}`,
    }));
    const pages = [all.slice(0, 24), all.slice(24, 48), all.slice(48, 60)];
    let merged = [];
    const counts = [];
    for (const page of pages) {
      merged = appendDishes(merged, page);
      counts.push(merged.length);
    }
    assert.deepEqual(counts, [24, 48, 60]);
    assert.equal(new Set(merged.map((d) => d.id)).size, 60);
    assert.equal(new Set(merged.map((d) => d.slug)).size, 60);
    assert.equal(hasMorePages(pages[2].length, pageSize), false);
  });
});

describe("history restoration plans", () => {
  it("trims for lower-page Back restoration", () => {
    const plan = planHistoryRestore(1, 3);
    assert.deepEqual(plan, { action: "trim", page: 1 });
    const cards = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }));
    const trimmed = sliceDishesToPage(cards, 1, 24);
    assert.equal(trimmed.length, 24);
    assert.equal(loadedPageFromCount(trimmed.length, 24), 1);
  });

  it("extends for Forward restoration", () => {
    assert.deepEqual(planHistoryRestore(3, 1), {
      action: "extend",
      fromPage: 1,
      toPage: 3,
    });
    assert.deepEqual(planHistoryRestore(2, 2), { action: "noop" });
  });

  it("shared ?page=N reconstruction uses extend from loaded 0/1", () => {
    // Fresh SSR is page 1 loaded; shared ?page=3 plans extend 1→3.
    assert.deepEqual(planHistoryRestore(3, 1), {
      action: "extend",
      fromPage: 1,
      toPage: 3,
    });
    // Empty before first fetch.
    assert.deepEqual(planHistoryRestore(3, 0), {
      action: "extend",
      fromPage: 0,
      toPage: 3,
    });
    const reconstructed = sliceDishesToPage(
      Array.from({ length: 60 }, (_, i) => ({ id: String(i) })),
      3,
      24,
    );
    assert.equal(reconstructed.length, 60);
  });

  it("filter change resets page to 1 in state helpers", () => {
    const base = parseBrowseState({ q: "pho", page: "3" });
    assert.equal(base.page, 3);
    const cleared = removeBrowseChip(base, "q");
    assert.equal(cleared.page, 1);
    assert.notEqual(browseFiltersKey(base), browseFiltersKey(cleared));
    assert.equal(clearBrowseFilters().page, 1);
  });

  it("load-more bump is a noop when loaded page already matches target", () => {
    // After Load more updates loadedPage before setState(page), plan is noop.
    assert.deepEqual(planHistoryRestore(2, 2), { action: "noop" });
  });
});

describe("safe encoding + domain recovery", () => {
  it("encodes queries and keeps Atlas recovery absolute", () => {
    assert.equal(safeQueryEncode("filled dough"), "filled%20dough");
    assert.equal(
      absoluteDishesIndexHref("geo", "pho"),
      "https://gustale.recipes/dishes?q=pho",
    );
    assert.equal(absoluteDishesIndexHref("recipes", "pho"), "/dishes?q=pho");
    const geo = recoveryLinks("geo");
    assert.ok(
      geo.primary.some((l) => l.href === "/regions" && l.label === "Countries"),
    );
    assert.equal(geo.altBrowse?.href, "https://gustale.recipes/dishes");
    assert.equal(mapBrowseHref("recipes"), "https://gustale.com/map");
    assert.equal(mapBrowseHref("geo"), "/map");
  });
});

describe("family + country directories", () => {
  const dishes = [
    {
      slug: "a",
      canonicalName: "Pierogi",
      familySlug: "dumpling",
      familyName: "Dumplings",
      originName: "Poland",
    },
    {
      slug: "b",
      canonicalName: "Gyoza",
      familySlug: "dumpling",
      familyName: "Dumplings",
      originName: "Japan",
    },
    {
      slug: "c",
      canonicalName: "Pho",
      familySlug: "noodle-soup",
      familyName: "Noodle soups",
      originName: "Vietnam",
    },
  ];

  it("builds searchable family directory", () => {
    const fams = buildFamilyDirectory(dishes);
    assert.equal(fams.length, 2);
    assert.equal(fams.find((f) => f.slug === "dumpling").count, 2);
    assert.ok(
      filterFamilyDirectory(fams, "gyoza").some((f) => f.slug === "dumpling"),
    );
  });

  it("builds country directory with alpha index", () => {
    const countries = buildCountryDirectory(dishes);
    assert.ok(countries.some((c) => c.name === "Japan"));
    assert.ok(
      filterCountryDirectory(countries, "pierogi").some(
        (c) => c.name === "Poland",
      ),
    );
    assert.ok(countryAlphaIndex(countries).includes("J"));
  });
});

describe("lineage filters URL + matching", () => {
  it("serializes lineage filters and filters results", () => {
    const state = parseLineageFilters({
      q: "dough",
      region: "china",
      confidence: "documented",
    });
    assert.equal(
      buildLineageQuery(state),
      "?q=dough&region=china&confidence=documented",
    );
    assert.equal(removeLineageChip(state, "region").region, null);
    assert.equal(clearLineageFilters().q, "");

    const lineages = [
      {
        name: "Filled dough",
        slug: "filled-dough",
        originRegions: ["China"],
        relatedRegions: [],
        techniques: ["Boiling"],
        historicalForces: ["trade_route"],
        confidenceLevel: "documented",
        representativeDishes: ["Jiaozi"],
        conceptSummary: "Wrapped dough parcels",
      },
      {
        name: "Noodle soup",
        slug: "noodle-soup",
        originRegions: ["Japan"],
        relatedRegions: [],
        techniques: ["Simmering"],
        historicalForces: ["migration"],
        confidenceLevel: "likely",
        representativeDishes: ["Ramen"],
      },
    ];
    assert.equal(applyLineageFilter(lineages, state).length, 1);
  });
});
