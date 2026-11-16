import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSectionActive,
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
    for (const s of siteSections()) {
      assert.ok(s.description.length > 10, `${s.label} has a description`);
    }
  });
});

describe("siteSections — the single build", () => {
  it("points every section at this host", () => {
    const by = Object.fromEntries(siteSections().map((s) => [s.label, s]));
    assert.equal(by["Atlas"].path, "/");
    assert.equal(by["Dishes"].path, "/dishes");
    assert.equal(by["Families"].path, "/families");
    assert.equal(by["Ingredients"].path, "/ingredients");
    assert.equal(by["History"].path, "/lineages");
    assert.equal(by["Recipes"].path, "/recipes");
  });

  it("marks NO section as external — the host split is gone", () => {
    // Before the cutover, "Ingredients" and "Recipes" were external on
    // the Atlas build, because they were served by the recipes host.
    // One build serves every section now, so nothing leaves the site.
    for (const s of siteSections()) {
      assert.equal(s.external, false, `${s.label} is local`);
    }
  });

  it("gives every section a relative, same-origin href", () => {
    for (const s of siteSections()) {
      assert.ok(s.path.startsWith("/"), `${s.label} href is relative`);
      assert.ok(!s.path.startsWith("//"), `${s.label} href is same-origin`);
    }
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
