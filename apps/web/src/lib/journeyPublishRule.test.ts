import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DishJourneyBeat } from "./api.ts";
import { getJourneyFixture, JOURNEY_FIXTURES } from "./dishJourneyFixtures.ts";
import {
  abstractOnlyChapters,
  evidenceForBeat,
  isPublishable,
  type JourneyEvidence,
  publishableChapters,
} from "./journeyEvidence.ts";

/**
 * THE PUBLISH RULE, enforced.
 *
 *   primary_inspected, full_text_inspected
 *       publishable
 *   abstract_only
 *       publishable only for what the abstract itself states, and
 *       labelled as such
 *   reported_only, inaccessible
 *       NEVER published
 *
 * The rule is not a convention that a render site might forget: the
 * component builds its chapter list through `publishableChapters`, so a
 * chapter that fails the rule cannot reach the page.
 */

const beat = (sequence: number, label = "A record."): DishJourneyBeat =>
  ({
    id: `b${sequence}`,
    sequence,
    label,
    lat: null,
    lng: null,
    yearApprox: null,
    confidence: "possible",
    source: null,
    title: null,
    dateLabel: null,
    datePrecision: null,
    evidenceKind: null,
    locator: null,
    authors: null,
    placeRole: null,
    scopeNote: null,
    bounds: [],
    regions: [],
  }) as DishJourneyBeat;

const ev = (
  level: JourneyEvidence["level"],
  unresolved = false,
): JourneyEvidence => ({
  level,
  materialInspected: "Something was read.",
  limits: "Something is not established.",
  unresolved,
});

describe("the publish rule", () => {
  it("publishes a primary record", () => {
    assert.equal(isPublishable(ev("primary_inspected")), true);
  });

  it("publishes a full text", () => {
    assert.equal(isPublishable(ev("full_text_inspected")), true);
  });

  it("publishes an abstract, but ONLY with its label", () => {
    assert.equal(isPublishable(ev("abstract_only")), true);
    const beats = [beat(1), beat(2)];
    const evidence = {
      "1": ev("primary_inspected"),
      "2": ev("abstract_only"),
    };
    assert.equal(publishableChapters(beats, evidence).length, 2);
    // The abstract-only chapter is identified so it can carry the label.
    const abstracts = abstractOnlyChapters(beats, evidence);
    assert.equal(abstracts.length, 1);
    assert.equal(abstracts[0]?.sequence, 2);
  });

  it("NEVER publishes a reported-only claim", () => {
    assert.equal(isPublishable(ev("reported_only")), false);
  });

  it("NEVER publishes an unreachable source", () => {
    assert.equal(isPublishable(ev("inaccessible")), false);
    assert.equal(isPublishable(ev("inaccessible", true)), false);
  });

  it("publishes a chapter with no evidence record", () => {
    // A production chapter has no review record. The rule is about what
    // HAS been checked, and absence of a record is not evidence of
    // neglect.
    assert.equal(isPublishable(undefined), true);
    assert.equal(isPublishable(null), true);
  });
});

describe("a non-publishable chapter cannot render", () => {
  it("is EXCLUDED from the rendered list, not greyed out", () => {
    const beats = [beat(1), beat(2), beat(3)];
    const evidence = {
      "1": ev("primary_inspected"),
      "2": ev("inaccessible"),
      "3": ev("full_text_inspected"),
    };
    const rendered = publishableChapters(beats, evidence);
    assert.equal(rendered.length, 2);
    assert.deepEqual(
      rendered.map((b) => b.sequence),
      [1, 3],
    );
    // The excluded chapter is not in the list at all.
    assert.ok(!rendered.some((b) => b.sequence === 2));
  });

  it("excludes a reported-only chapter too", () => {
    const beats = [beat(1), beat(2)];
    const evidence = {
      "1": ev("reported_only"),
      "2": ev("full_text_inspected"),
    };
    const rendered = publishableChapters(beats, evidence);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0]?.sequence, 2);
  });

  it("the numbering has no gap after an exclusion", () => {
    // The display numbering is applied to the SURVIVING chapters, so a
    // reader sees "1 / 2" rather than "1 / 3" with chapter 2 missing.
    const beats = [beat(1), beat(2), beat(3)];
    const evidence = {
      "1": ev("primary_inspected"),
      "2": ev("inaccessible"),
      "3": ev("primary_inspected"),
    };
    const rendered = publishableChapters(beats, evidence);
    assert.equal(rendered.length, 2);
    const displayed = rendered.map((_, i) => i + 1);
    assert.deepEqual(displayed, [1, 2]);
  });

  it("a dish whose EVERY chapter is unreachable renders no chapters", () => {
    const beats = [beat(1), beat(2)];
    const evidence = { "1": ev("inaccessible"), "2": ev("reported_only") };
    assert.equal(publishableChapters(beats, evidence).length, 0);
  });
});

describe("the review fixtures obey the rule", () => {
  it("the moussaka chapter 2 is NOT publishable and is excluded", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    const rendered = publishableChapters(f.beats, f.evidence);
    // Three chapters, one excluded.
    assert.equal(rendered.length, 2);
    assert.ok(
      !rendered.some((b) => b.sequence === 2),
      "the Kremezi chapter is still in the rendered list",
    );
    const excluded = f.beats.find((b) => b.sequence === 2);
    assert.ok(excluded);
    assert.equal(isPublishable(evidenceForBeat(excluded, f.evidence)), false);
  });

  it("BOTH hot-pot chapters are excluded", () => {
    const f = getJourneyFixture("chongqing-hot-pot");
    assert.ok(f);
    const rendered = publishableChapters(f.beats, f.evidence);
    assert.equal(f.beats.length, 2);
    assert.equal(rendered.length, 0);
  });

  it("all six bibimbap chapters survive — two are abstract-only", () => {
    const f = getJourneyFixture("bibimbap");
    assert.ok(f);
    const rendered = publishableChapters(f.beats, f.evidence);
    assert.equal(rendered.length, 6);
    const abstracts = abstractOnlyChapters(f.beats, f.evidence);
    assert.equal(abstracts.length, 2);
    assert.deepEqual(
      abstracts.map((b) => b.sequence),
      [5, 6],
    );
  });

  it("every fixture's rendered count matches the rule", () => {
    for (const [slug, f] of Object.entries(JOURNEY_FIXTURES)) {
      const rendered = publishableChapters(f.beats, f.evidence);
      const expected = f.beats.filter((b) =>
        isPublishable(evidenceForBeat(b, f.evidence)),
      ).length;
      assert.equal(
        rendered.length,
        expected,
        `${slug}: the rule is not applied`,
      );
      for (const b of rendered) {
        const e = evidenceForBeat(b, f.evidence);
        assert.ok(
          e?.level !== "inaccessible" && e?.level !== "reported_only",
          `${slug}: chapter ${b.sequence} is rendered at ${e?.level}`,
        );
      }
    }
  });
});
