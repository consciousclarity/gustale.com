import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getJourneyFixture, JOURNEY_FIXTURES } from "./dishJourneyFixtures.ts";
import { buildSectionLinks, DISH_SECTION_IDS } from "./dishSections.ts";

describe("pilot fixtures — review material, never live content", () => {
  it("covers exactly the five documented cases", () => {
    assert.deepEqual(Object.keys(JOURNEY_FIXTURES).sort(), [
      "beyaynetu",
      "bibimbap",
      "century-egg-tofu",
      "chongqing-hot-pot",
      "moussaka-greek",
    ]);
  });

  it("gives bibimbap its six recorded chapters", () => {
    const f = getJourneyFixture("bibimbap");
    assert.ok(f);
    assert.equal(f.status, "history");
    assert.equal(f.beats.length, 6);
  });

  it("gives moussaka three records of three different kinds", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    assert.equal(f.beats.length, 3);
  });

  it("marks century egg & tofu as a research gap with no chapters", () => {
    const f = getJourneyFixture("century-egg-tofu");
    assert.ok(f);
    assert.equal(f.status, "gap");
    assert.equal(f.beats.length, 0);
    assert.ok(f.gapNote);
  });

  it("marks beyaynetu as a research gap with no chapters", () => {
    const f = getJourneyFixture("beyaynetu");
    assert.ok(f);
    assert.equal(f.status, "gap");
    assert.equal(f.beats.length, 0);
    assert.ok(f.gapNote);
  });

  it("gives every chapter a source, a locator and an inspection note", () => {
    for (const slug of Object.keys(JOURNEY_FIXTURES)) {
      const f = getJourneyFixture(slug);
      assert.ok(f);
      for (const b of f.beats) {
        assert.ok(b.source, `${slug}: ${b.placeName} has no source`);
        assert.ok(b.scopeNote, `${slug}: ${b.placeName} has no scope note`);
        assert.ok(
          b.evidenceKind,
          `${slug}: ${b.placeName} has no evidence kind`,
        );
      }
    }
  });

  it("gives every chapter a date that keeps its precision", () => {
    for (const slug of Object.keys(JOURNEY_FIXTURES)) {
      const f = getJourneyFixture(slug);
      assert.ok(f);
      for (const b of f.beats) {
        assert.ok(
          b.dateLabel || b.yearApprox != null,
          `${slug}: ${b.placeName} has no date`,
        );
      }
    }
  });

  it("draws no movement for moussaka, because its records are different kinds", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    assert.equal(f.movements.length, 0);
  });

  it("returns null for a slug outside the fixture set", () => {
    assert.equal(getJourneyFixture("chicken-tikka-masala"), null);
  });
});

describe("section nav — every link reaches real content", () => {
  it("puts Journey first", () => {
    const links = buildSectionLinks({
      hasJourney: true,
      hasIngredients: true,
      hasVariants: true,
      hasPreparation: true,
      hasSources: true,
    });
    assert.equal(links[0]?.id, DISH_SECTION_IDS.journey);
    assert.equal(links[0]?.label, "Journey");
  });

  it("omits a section that is not on the page", () => {
    const links = buildSectionLinks({
      hasJourney: true,
      hasIngredients: false,
      hasVariants: false,
      hasPreparation: false,
      hasSources: true,
    });
    assert.deepEqual(
      links.map((l) => l.id),
      [
        DISH_SECTION_IDS.journey,
        DISH_SECTION_IDS.sources,
        // The places & traditions section is on every dish page, so it
        // is always in the nav.
        DISH_SECTION_IDS.places,
      ],
    );
  });

  it("always reaches the places & traditions section", () => {
    const links = buildSectionLinks({
      hasJourney: true,
      hasIngredients: false,
      hasVariants: false,
      hasPreparation: false,
      hasSources: false,
    });
    const places = links.find((l) => l.id === DISH_SECTION_IDS.places);
    assert.ok(places, "the nav has no link to the places & traditions section");
    assert.equal(places.label, "Places & traditions");
  });

  it("never links to an anchor that does not exist", () => {
    const ids = new Set<string>(Object.values(DISH_SECTION_IDS));
    const links = buildSectionLinks({
      hasJourney: true,
      hasIngredients: true,
      hasVariants: true,
      hasPreparation: true,
      hasSources: true,
    });
    for (const l of links) {
      assert.ok(ids.has(l.id), `unknown anchor: ${l.id}`);
    }
  });

  it("still includes Journey when nothing else is on the page", () => {
    const links = buildSectionLinks({
      hasJourney: true,
      hasIngredients: false,
      hasVariants: false,
      hasPreparation: false,
      hasSources: false,
    });
    assert.equal(links.length, 2);
    assert.equal(links[0]?.id, DISH_SECTION_IDS.journey);
    assert.equal(links[1]?.id, DISH_SECTION_IDS.places);
  });
});
