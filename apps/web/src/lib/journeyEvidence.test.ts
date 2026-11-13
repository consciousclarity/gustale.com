import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getJourneyFixture, JOURNEY_FIXTURES } from "./dishJourneyFixtures.ts";
import {
  EVIDENCE_LEVEL_LABELS,
  EVIDENCE_LEVEL_NOTES,
  type EvidenceLevel,
  evidenceForBeat,
  isPublishable,
  type JourneyEvidence,
  tallyEvidence,
} from "./journeyEvidence.ts";

describe("the evidence levels are distinct and each says what it means", () => {
  it("has a label and a note for every level", () => {
    const levels: EvidenceLevel[] = [
      "primary_inspected",
      "full_text_inspected",
      "abstract_only",
      "reported_only",
      "inaccessible",
    ];
    for (const level of levels) {
      assert.ok(EVIDENCE_LEVEL_LABELS[level], `no label for ${level}`);
      assert.ok(
        EVIDENCE_LEVEL_NOTES[level].length > 20,
        `the note for ${level} is too thin to be useful`,
      );
    }
  });

  it("distinguishes a full text from an abstract", () => {
    assert.notEqual(
      EVIDENCE_LEVEL_LABELS.full_text_inspected,
      EVIDENCE_LEVEL_LABELS.abstract_only,
    );
    assert.ok(
      EVIDENCE_LEVEL_NOTES.abstract_only.includes("abstract"),
      "the abstract note must say the material was an abstract",
    );
    assert.ok(
      EVIDENCE_LEVEL_NOTES.abstract_only.includes("nothing beyond it"),
      "the abstract note must say what an abstract cannot support",
    );
  });

  it("distinguishes a primary record from a secondary interpretation", () => {
    assert.notEqual(
      EVIDENCE_LEVEL_LABELS.primary_inspected,
      EVIDENCE_LEVEL_LABELS.full_text_inspected,
    );
    assert.ok(
      EVIDENCE_LEVEL_NOTES.primary_inspected.includes("original record"),
      "the primary note must say the original was read",
    );
  });
});

describe("publishability follows the evidence, not the pack's label", () => {
  const ev = (level: EvidenceLevel, unresolved = false): JourneyEvidence => ({
    level,
    materialInspected: "x",
    limits: "y",
    unresolved,
  });

  it("a primary or full-text record may be published", () => {
    assert.equal(isPublishable(ev("primary_inspected")), true);
    assert.equal(isPublishable(ev("full_text_inspected")), true);
  });

  it("an abstract may be published — it supports what it states", () => {
    assert.equal(isPublishable(ev("abstract_only")), true);
  });

  it("a reported-only or unreachable source may NOT be published", () => {
    assert.equal(isPublishable(ev("reported_only")), false);
    assert.equal(isPublishable(ev("inaccessible")), false);
    assert.equal(isPublishable(ev("inaccessible", true)), false);
  });

  it("a chapter with no evidence record is not blocked", () => {
    assert.equal(isPublishable(null), true);
    assert.equal(isPublishable(undefined), true);
  });
});

describe("the fixtures carry a real evidence record for every chapter", () => {
  it("every chapter of every fixture that HAS chapters has an evidence record", () => {
    for (const [slug, fixture] of Object.entries(JOURNEY_FIXTURES)) {
      if (fixture.beats.length === 0) {
        // A fixture with no chapters has nothing to verify. The two
        // research-gap fixtures are exactly that case.
        assert.equal(
          fixture.evidence,
          undefined,
          `${slug} has no chapters but carries an evidence map`,
        );
        continue;
      }
      assert.ok(fixture.evidence, `${slug} has no evidence map`);
      for (const beat of fixture.beats) {
        const e = evidenceForBeat(beat, fixture.evidence);
        assert.ok(e, `${slug} chapter ${beat.sequence} has no evidence record`);
        assert.ok(
          e.materialInspected.length > 20,
          `${slug} chapter ${beat.sequence} does not say what was inspected`,
        );
        assert.ok(
          e.limits.length > 20,
          `${slug} chapter ${beat.sequence} does not say what is not established`,
        );
      }
    }
  });

  it("the two research-gap fixtures have no chapters and no evidence map", () => {
    for (const slug of ["century-egg-tofu", "beyaynetu"]) {
      const f = getJourneyFixture(slug);
      assert.ok(f);
      assert.equal(f.beats.length, 0);
      assert.equal(f.evidence, undefined);
    }
  });

  it("the moussaka chapter 1 is recorded as a PRIMARY record", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    const e = evidenceForBeat(f.beats[0], f.evidence);
    assert.equal(e?.level, "primary_inspected");
    assert.ok(
      e?.materialInspected.includes("receipt No. 106"),
      "the primary record must name what was read",
    );
  });

  it("the two Joo 2010 chapters are recorded as ABSTRACT ONLY, not full text", () => {
    const f = getJourneyFixture("bibimbap");
    assert.ok(f);
    const c5 = evidenceForBeat(f.beats[4], f.evidence);
    const c6 = evidenceForBeat(f.beats[5], f.evidence);
    assert.equal(c5?.level, "abstract_only");
    assert.equal(c6?.level, "abstract_only");
    assert.ok(
      c5?.limits.includes("paywalled"),
      "the abstract chapter must say the full article was not accessed",
    );
  });

  it("the two hot-pot chapters are recorded as UNREACHABLE and not publishable", () => {
    const f = getJourneyFixture("chongqing-hot-pot");
    assert.ok(f);
    for (const beat of f.beats) {
      const e = evidenceForBeat(beat, f.evidence);
      assert.equal(e?.level, "inaccessible");
      assert.equal(isPublishable(e), false);
    }
  });

  it("the Kremezi chapter is recorded as UNREACHABLE", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    const e = evidenceForBeat(f.beats[1], f.evidence);
    assert.equal(e?.level, "inaccessible");
    assert.equal(isPublishable(e), false);
  });
});

describe("the tally is broken down, not aggregated", () => {
  it("counts each level separately and the unresolved chapters apart", () => {
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    const tally = tallyEvidence(f.beats, f.evidence);
    assert.equal(tally.total, 3);
    assert.equal(tally.byLevel.primary_inspected, 1);
    assert.equal(tally.byLevel.full_text_inspected, 1);
    assert.equal(tally.byLevel.inaccessible, 1);
    assert.equal(tally.unresolved, 1);
    assert.equal(tally.publishable, 2);
  });

  it("the aggregate count is never the same number as the publishable count", () => {
    // This is the point of the breakdown: a single "three chapters
    // verified" number would have hidden the unreachable one.
    const f = getJourneyFixture("moussaka-greek");
    assert.ok(f);
    const tally = tallyEvidence(f.beats, f.evidence);
    assert.notEqual(tally.total, tally.publishable);
  });
});
