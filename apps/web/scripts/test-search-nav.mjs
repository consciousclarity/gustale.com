#!/usr/bin/env node
/**
 * Focused unit tests for U0-B search/nav helpers.
 * Run: node --test scripts/test-search-nav.mjs
 */
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addDishHref,
  clampActiveIndex,
  isDishesIndexPath,
  isPrimaryNavActive,
  resolveSearchHitHref,
  searchErrorBrowseLinks,
  searchHelpLinks,
  searchOptionId,
  seeAllDishesHref,
} from "./search-nav-helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("resolveSearchHitHref", () => {
  it("is a no-op: every hit is already local", () => {
    // ONE SITE. There is no other host, so there is nothing to
    // rewrite — the href comes back exactly as it went in.
    assert.equal(
      resolveSearchHitHref("/ingredients/ginger", "geo"),
      "/ingredients/ginger",
    );
    assert.equal(resolveSearchHitHref("/dishes?q=pho", "geo"), "/dishes?q=pho");
    assert.equal(resolveSearchHitHref("/dishes", "geo"), "/dishes");
  });

  it("preserves dish detail and query strings", () => {
    assert.equal(
      resolveSearchHitHref("/dishes/vindaloo", "geo"),
      "/dishes/vindaloo",
    );
    assert.equal(
      resolveSearchHitHref("/ingredients/salt?x=1", "geo"),
      "/ingredients/salt?x=1",
    );
  });

  it("leaves relative hrefs alone on Recipes", () => {
    assert.equal(
      resolveSearchHitHref("/ingredients/ginger", "recipes"),
      "/ingredients/ginger",
    );
    assert.equal(
      resolveSearchHitHref("/dishes?q=pho", "recipes"),
      "/dishes?q=pho",
    );
  });
});

describe("seeAllDishesHref", () => {
  it("uses a relative dishes URL and preserves query encoding", () => {
    assert.equal(
      seeAllDishesHref("filled dough", "geo"),
      "/dishes?q=filled%20dough",
    );
    assert.equal(seeAllDishesHref("pho", "recipes"), "/dishes?q=pho");
  });
});

describe("searchOptionId", () => {
  it("is placement-specific and stable", () => {
    const a = searchOptionId("header", "dish", "vindaloo");
    const b = searchOptionId("drawer", "dish", "vindaloo");
    assert.equal(a, "gs-opt-header-dish-vindaloo");
    assert.equal(b, "gs-opt-drawer-dish-vindaloo");
    assert.notEqual(a, b);
  });
});

describe("clampActiveIndex", () => {
  it("clamps and resets safely", () => {
    assert.equal(clampActiveIndex(0, 0), 0);
    assert.equal(clampActiveIndex(5, 0), 0);
    assert.equal(clampActiveIndex(-1, 3), 0);
    assert.equal(clampActiveIndex(99, 3), 2);
    assert.equal(clampActiveIndex(1, 3), 1);
  });
});

describe("fallback browse links", () => {
  // THE SIX SECTIONS.
  //
  // These used to assert a FOURTH navigation with its own labels
  // ("Globe", "Places", "Food families", "History & connections",
  // "Browse recipes"). Now the search names the same six sections the
  // header and the footer do, with the same labels and the same
  // hrefs.
  it("Atlas help + error links are domain-valid", () => {
    const help = searchHelpLinks("geo");
    const err = searchErrorBrowseLinks("geo");

    assert.ok(help.some((l) => l.href === "/" && l.label === "Atlas"));
    assert.ok(help.some((l) => l.href === "/dishes" && l.label === "Dishes"));
    assert.ok(
      help.some((l) => l.href === "/families" && l.label === "Families"),
    );
    assert.ok(
      help.some((l) => l.href === "/lineages" && l.label === "History"),
    );
    // EVERY section is relative, because there is no other host to
    // point at.
    assert.ok(
      help.some((l) => l.href === "/ingredients" && l.label === "Ingredients"),
    );
    assert.ok(help.some((l) => l.href === "/recipes" && l.label === "Recipes"));
    assert.ok(!help.some((l) => l.href.startsWith("https://")));

    // The error links are the SAME list, with the same labels.
    assert.ok(
      err.some((l) => l.href === "/families" && l.label === "Families"),
    );
    assert.ok(err.some((l) => l.href === "/lineages" && l.label === "History"));
    assert.ok(err.some((l) => l.href === "/recipes" && l.label === "Recipes"));
  });

  it("Recipes help + error links stay local where valid", () => {
    const help = searchHelpLinks("recipes");
    const err = searchErrorBrowseLinks("recipes");
    // Everything is relative on the recipes build.
    assert.ok(help.some((l) => l.href === "/dishes" && l.label === "Dishes"));
    assert.ok(
      help.some((l) => l.href === "/ingredients" && l.label === "Ingredients"),
    );
    assert.ok(help.some((l) => l.href === "/recipes" && l.label === "Recipes"));
    assert.ok(!help.some((l) => l.href.startsWith("https://")));
    assert.ok(err.some((l) => l.href === "/dishes"));
    assert.ok(err.some((l) => l.href === "/ingredients"));
  });
});

describe("isPrimaryNavActive", () => {
  it("maps nested routes to primary links", () => {
    assert.equal(
      isPrimaryNavActive("/families", "/family/dumpling/", "geo"),
      true,
    );
    assert.equal(
      isPrimaryNavActive("/lineages", "/lineages/filled-dough/", "geo"),
      true,
    );
    assert.equal(
      isPrimaryNavActive("/regions", "/regions/japan/", "geo"),
      true,
    );
    assert.equal(
      isPrimaryNavActive("/dishes", "/dishes/vindaloo/", "recipes"),
      true,
    );
    assert.equal(isPrimaryNavActive("/", "/regions", "geo"), false);
  });
});

describe("addDishHref", () => {
  it("is relative on every build", () => {
    // ONE SITE: the authoring form is on this site, so the link to it
    // is a relative path.
    assert.equal(addDishHref("geo"), "/dishes/new");
    assert.equal(addDishHref("recipes"), "/dishes/new");
  });
});

describe("isDishesIndexPath", () => {
  it("detects list but not detail", () => {
    assert.equal(isDishesIndexPath("/dishes"), true);
    assert.equal(isDishesIndexPath("/dishes/"), true);
    assert.equal(isDishesIndexPath("/dishes?q=x"), true);
    assert.equal(isDishesIndexPath("/dishes/vindaloo"), false);
  });
});

describe("canonical nav files", () => {
  it("SiteHeader.astro remains absent and Nav.astro exists", async () => {
    await assert.rejects(() =>
      access(join(root, "src/components/SiteHeader.astro")),
    );
    await access(join(root, "src/components/Nav.astro"));
  });
});
