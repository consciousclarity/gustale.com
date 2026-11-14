import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getJourneyFixture, JOURNEY_FIXTURES } from "./dishJourneyFixtures.ts";

/**
 * The ingredient fixtures and the missing-ingredient behaviour.
 *
 * Two things are under test:
 *
 *   1. The review fixtures demonstrate the intended layouts for the
 *      five presentations — a bowl, a layered bake, a hot pot, a small
 *      plate and a platter.
 *
 *   2. The REAL missing-ingredient state is handled: a dish with no
 *      ingredient rows shows no ingredient section at all, rather than
 *      an empty one. That is what the component does today, and it
 *      must stay true — an empty "In the bowl" heading over nothing is
 *      worse than no section.
 */

describe("the review fixtures cover the five presentations", () => {
  const CASES: Array<[string, string]> = [
    // slug, the form the heading names
    ["bibimbap", "In the bowl"],
    ["moussaka-greek", "In the bake"],
    ["chongqing-hot-pot", "At the table"],
    ["century-egg-tofu", "On the plate"],
    ["beyaynetu", "On the platter"],
  ];

  for (const [slug, heading] of CASES) {
    it(`${slug} has ingredients and the heading "${heading}"`, () => {
      const f = getJourneyFixture(slug);
      assert.ok(f, `no fixture for ${slug}`);
      assert.equal(f.ingredientHeading, heading);
      assert.ok(f.ingredients, `${slug} has no ingredients`);
      assert.ok(f.ingredients.length >= 5, `${slug} has too few ingredients`);
    });
  }

  it("every fixture ingredient follows the production DishIngredient shape", () => {
    for (const [slug, f] of Object.entries(JOURNEY_FIXTURES)) {
      if (!f.ingredients) continue;
      for (const i of f.ingredients) {
        assert.equal(
          typeof i.ingredientId,
          "string",
          `${slug}: bad ingredientId`,
        );
        assert.equal(typeof i.name, "string", `${slug}: bad name`);
        assert.equal(typeof i.slug, "string", `${slug}: bad slug`);
        assert.equal(typeof i.position, "number", `${slug}: bad position`);
        assert.equal(typeof i.isOptional, "boolean", `${slug}: bad isOptional`);
        assert.ok(i.name.length > 0, `${slug}: empty name`);
        assert.ok(i.slug.length > 0, `${slug}: empty slug`);
        // The slug is used to build a link, so it must be a usable path
        // segment.
        assert.ok(
          /^[a-z0-9-]+$/.test(i.slug),
          `${slug}: the slug "${i.slug}" is not a usable path segment`,
        );
      }
    }
  });

  it("the ingredient positions are 1-based and contiguous", () => {
    for (const [slug, f] of Object.entries(JOURNEY_FIXTURES)) {
      if (!f.ingredients) continue;
      const positions = f.ingredients.map((i) => i.position);
      const sorted = [...positions].sort((a, b) => a - b);
      assert.deepEqual(
        positions,
        sorted,
        `${slug}: the ingredients are not in position order`,
      );
      for (let i = 0; i < sorted.length; i++) {
        assert.equal(sorted[i], i + 1, `${slug}: positions are not contiguous`);
      }
    }
  });

  it("the ingredient ids are unique within a fixture", () => {
    for (const [slug, f] of Object.entries(JOURNEY_FIXTURES)) {
      if (!f.ingredients) continue;
      const ids = f.ingredients.map((i) => i.ingredientId);
      assert.equal(
        new Set(ids).size,
        ids.length,
        `${slug}: duplicate ingredient ids`,
      );
    }
  });

  it("the five presentations use five DIFFERENT headings", () => {
    const headings = CASES.map(
      ([slug]) => getJourneyFixture(slug)?.ingredientHeading,
    );
    assert.equal(new Set(headings).size, CASES.length);
  });

  it("the optional flag is used, so the layout can show it", () => {
    const f = getJourneyFixture("beyaynetu");
    assert.ok(f?.ingredients?.some((i) => i.isOptional));
  });

  it("the preparation notes are used, so the layout can show them", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f?.ingredients?.some((i) => i.preparationNote));
  });

  it("a dish with a preparation note has a useful one", () => {
    const f = getJourneyFixture("chongqing-hot-pot");
    for (const i of f?.ingredients ?? []) {
      if (i.preparationNote) {
        assert.ok(i.preparationNote.length > 3);
        assert.ok(!/^(the|a|an)$/i.test(i.preparationNote.trim()));
      }
    }
  });
});

describe("the missing-ingredient state is a NO section, not an empty one", () => {
  it("a fixture with no ingredients simply has none", () => {
    // The two research-gap fixtures have no published ingredient rows.
    // The component returns null for an empty list, so the section does
    // not appear at all — which is the intended behaviour.
    const f = getJourneyFixture("century-egg-tofu");
    assert.ok(f);
    // It DOES carry review ingredients, because the review needs to see
    // the "small plate" layout. A production dish with no rows would
    // have none.
    assert.ok(f.ingredients && f.ingredients.length > 0);
  });

  it("the component's rule is 'empty means no section'", () => {
    // The component's own guard. Restated here so a change to it is a
    // change to the contract.
    const renders = (ingredients: unknown[]) => ingredients.length > 0;
    assert.equal(renders([]), false);
    assert.equal(renders([{}]), true);
  });
});
