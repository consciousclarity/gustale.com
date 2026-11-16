import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSectionActive,
  RECIPES_HOST_SECTIONS,
  SECTION_LABELS,
  SECTION_PATHS,
  siteSections,
} from "./sections.ts";

describe("siteSections — the six sections", () => {
  it("has exactly six, in the blueprint's order", () => {
    assert.deepEqual(
      [...SECTION_LABELS],
      ["Atlas", "Dishes", "Families", "Ingredients", "History", "Recipes"],
    );
  });

  it("retires the old labels", () => {
    assert.ok(
      !SECTION_LABELS.includes("Explore" as never),
      '"Explore" is gone',
    );
    assert.ok(
      !SECTION_LABELS.includes("Dish origins" as never),
      '"Dish origins" is gone',
    );
    assert.ok(
      !SECTION_LABELS.includes("Lineages" as never),
      '"Lineages" is gone',
    );
    assert.ok(
      !SECTION_LABELS.includes("History & connections" as never),
      "the long label is gone",
    );
  });

  it("gives every section a description", () => {
    for (const s of siteSections(false)) {
      assert.ok(s.description.length > 10, `${s.label} has a description`);
    }
  });
});

describe("siteSections — the Atlas build", () => {
  it("points the local sections at this host", () => {
    const by = Object.fromEntries(siteSections(false).map((s) => [s.label, s]));
    assert.equal(by["Atlas"].path, "/");
    assert.equal(by["Dishes"].path, "/dishes");
    assert.equal(by["Families"].path, "/families");
    assert.equal(by["History"].path, "/lineages");
  });

  it("marks Ingredients and Recipes as living on the other host", () => {
    const by = Object.fromEntries(siteSections(false).map((s) => [s.label, s]));
    assert.equal(by["Ingredients"].external, true);
    assert.equal(by["Recipes"].external, true);
  });

  it("marks the local sections as not external", () => {
    for (const s of siteSections(false)) {
      if (s.external) continue;
      assert.equal(s.external, false, `${s.label} is local`);
    }
  });

  it("names exactly the two recipes-host sections", () => {
    assert.deepEqual([...RECIPES_HOST_SECTIONS], ["Ingredients", "Recipes"]);
  });
});

describe("siteSections — the Recipes build", () => {
  it("points everything at this host", () => {
    for (const s of siteSections(true)) {
      assert.equal(s.external, false, `${s.label} is local here`);
    }
  });

  it("keeps the same six paths on both hosts", () => {
    const atlas = siteSections(false).map((s) => [s.label, s.path]);
    const recipes = siteSections(true).map((s) => [s.label, s.path]);
    assert.deepEqual(atlas, recipes);
  });
});

describe("SECTION_PATHS", () => {
  it("are the paths the site actually serves", () => {
    // The History section's PATH stays "/lineages" even though the
    // public WORD is now "History" -- the path moves in WP-E1.
    assert.equal(SECTION_PATHS["History"], "/lineages");
    assert.equal(SECTION_PATHS["Atlas"], "/");
  });
});

describe("isSectionActive", () => {
  const cases: Array<[string, string, boolean, string]> = [
    ["/", "/", true, "the Atlas home"],
    ["/", "/dishes/empanada", false, "a dish page is not the Atlas home"],
    ["/dishes", "/dishes", true, "the dish index"],
    ["/dishes", "/dishes/empanada", true, "a dish page"],
    ["/dishes", "/dishes/", true, "the dish index with a trailing slash"],
    ["/families", "/families", true, "the family index"],
    ["/families", "/families/curry", true, "a family page"],
    [
      "/families",
      "/family/curry",
      true,
      "the SINGULAR family path still counts",
    ],
    ["/families", "/family/", true, "the singular family path, trailing slash"],
    ["/lineages", "/lineages", true, "the thread index"],
    ["/lineages", "/lineages/threads", true, "a thread page"],
    ["/about", "/about/evidence", true, "a sub-page of About"],
    ["/about", "/about", true, "About itself"],
    ["/dishes", "/families/curry", false, "a family page is not a dish"],
    ["/", "/families", false, "a family page is not the Atlas home"],
  ];

  for (const [path, pathname, expected, why] of cases) {
    it(`${path} is ${expected ? "active" : "not active"} on ${pathname} — ${why}`, () => {
      assert.equal(isSectionActive(path, pathname), expected);
    });
  }
});
