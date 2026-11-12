import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DishJourneyBeat,
  DishJourneyLineage,
  DishJourneyMovement,
} from "./api.ts";
import {
  CONFIDENCE_LABELS,
  drawableMovements,
  EVIDENCE_KIND_LABELS,
  formatJourneyDate,
  frameForBeat,
  hasJourneyDate,
  isDirectionalLineageRole,
  lineageMembersLabel,
  lineageRoleLabel,
  mapCaptionForBeat,
  PLACE_ROLE_LABELS,
} from "./journey.ts";

const beat = (b: Partial<DishJourneyBeat>): DishJourneyBeat => ({
  id: "b1",
  sequence: 1,
  placeName: "Korea",
  lat: null,
  lng: null,
  yearApprox: null,
  label: "A claim.",
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
  ...b,
});

describe("formatJourneyDate — the date keeps the precision the source supports", () => {
  it("prefers the editor's own label over the integer anchor", () => {
    const b = beat({
      dateLabel: "1810 · historical name record",
      yearApprox: 1810,
    });
    assert.equal(formatJourneyDate(b), "1810 · historical name record");
  });

  it("renders a circa year with 'c.'", () => {
    assert.equal(
      formatJourneyDate(beat({ yearApprox: 1900, datePrecision: "circa" })),
      "c. 1900",
    );
  });

  it("renders a range from the label, because a range cannot live in an integer", () => {
    assert.equal(
      formatJourneyDate(beat({ dateLabel: "1810–1820", yearApprox: 1815 })),
      "1810–1820",
    );
  });

  it("renders a century", () => {
    assert.equal(
      formatJourneyDate(beat({ yearApprox: 1880, datePrecision: "century" })),
      "19th century",
    );
    assert.equal(
      formatJourneyDate(beat({ yearApprox: 2000, datePrecision: "century" })),
      "20th century",
    );
  });

  it("renders a decade", () => {
    assert.equal(
      formatJourneyDate(beat({ yearApprox: 1935, datePrecision: "decade" })),
      "1930s",
    );
  });

  it("renders BCE without a year zero", () => {
    assert.equal(
      formatJourneyDate(beat({ yearApprox: -44, datePrecision: "bce" })),
      "44 BCE",
    );
    // A CE year of zero would be a year zero, which does not exist.
    assert.equal(
      formatJourneyDate(beat({ yearApprox: 0, datePrecision: "ce" })),
      "1 CE",
    );
  });

  it("never invents a date from a missing year", () => {
    assert.equal(formatJourneyDate(beat({})), null);
    assert.equal(formatJourneyDate(beat({ yearApprox: null })), null);
  });

  it("does not substitute the source's publication year for a missing date", () => {
    // A chapter with no date but a 2023 source must still show no date.
    const b = beat({
      yearApprox: null,
      dateLabel: null,
      source: {
        id: "s1",
        title: "A 2023 study",
        url: null,
        citationText: null,
        year: 2023,
        reliability: "secondary",
      },
    });
    assert.equal(formatJourneyDate(b), null);
  });
});

describe("hasJourneyDate", () => {
  it("is false for a chapter with no date at all", () => {
    assert.equal(hasJourneyDate(beat({})), false);
  });
  it("is true when either a label or an anchor exists", () => {
    assert.equal(hasJourneyDate(beat({ dateLabel: "1930s" })), true);
    assert.equal(hasJourneyDate(beat({ yearApprox: 1930 })), true);
  });
});

describe("evidence and confidence are labelled separately", () => {
  it("has a distinct label for every evidence kind", () => {
    assert.equal(EVIDENCE_KIND_LABELS.primary_record, "Primary record");
    assert.equal(
      EVIDENCE_KIND_LABELS.scholarly_interpretation,
      "Scholarly interpretation",
    );
    assert.equal(EVIDENCE_KIND_LABELS.reported_account, "Reported account");
  });

  it("keeps the four existing confidence values", () => {
    assert.deepEqual(Object.keys(CONFIDENCE_LABELS).sort(), [
      "documented",
      "likely",
      "parallel",
      "possible",
    ]);
  });

  it("has a label for every place role", () => {
    for (const role of Object.keys(PLACE_ROLE_LABELS)) {
      assert.ok(PLACE_ROLE_LABELS[role as keyof typeof PLACE_ROLE_LABELS]);
    }
  });
});

describe("lineage roles — a grouping is never an ancestor", () => {
  const lineage = (role: DishJourneyLineage["role"]): DishJourneyLineage => ({
    slug: "rice-pilaf",
    name: "Rice as Carrier",
    shortDescription: null,
    longDescription: null,
    conceptSummary: null,
    originSummary: null,
    confidenceLevel: "likely",
    uncertaintyNote: null,
    culturalPracticeNote: null,
    role,
    roleExplanation: null,
    changedElements: [],
    sortOrder: 5,
    relatedDishes: [],
  });

  it("treats only ancestor and descendant as directional", () => {
    assert.equal(isDirectionalLineageRole("ancestor"), true);
    assert.equal(isDirectionalLineageRole("descendant"), true);
    assert.equal(isDirectionalLineageRole("regional_variant"), false);
    assert.equal(isDirectionalLineageRole("parallel_evolution"), false);
    assert.equal(isDirectionalLineageRole("uncertain"), false);
  });

  it("describes a non-directional membership as a relation, not a descent", () => {
    const text = lineageRoleLabel(lineage("regional_variant"));
    assert.ok(text.includes("regional variant"));
    assert.ok(!text.toLowerCase().includes("ancestor"));
    assert.ok(!text.toLowerCase().includes("descendant"));
  });

  it("describes an uncertain membership as uncertain", () => {
    const text = lineageRoleLabel(lineage("uncertain"));
    assert.ok(text.toLowerCase().includes("related to"));
  });

  it("labels the member list honestly for a grouping", () => {
    assert.ok(
      lineageMembersLabel(lineage("cousin")).startsWith("Related dishes"),
    );
    assert.ok(lineageMembersLabel(lineage("ancestor")).startsWith("Dishes in"));
  });
});

describe("movements — a line is drawn only when a source supports it", () => {
  const src = {
    id: "s1",
    title: "A source",
    url: null,
    citationText: null,
    year: 1948,
    reliability: "secondary",
  };

  it("keeps a sourced movement between two located chapters", () => {
    const from = beat({ id: "b1", lat: 29.56, lng: 106.55 });
    const to = beat({ id: "b2", lat: 30.57, lng: 104.07 });
    const movement: DishJourneyMovement = {
      id: "m1",
      fromBeatId: "b1",
      toBeatId: "b2",
      label: "reported transmission",
      confidence: "possible",
      source: src,
    };
    const out = drawableMovements([from, to], [movement]);
    assert.equal(out.length, 1);
  });

  it("drops a movement with no source", () => {
    const from = beat({ id: "b1", lat: 29.56, lng: 106.55 });
    const to = beat({ id: "b2", lat: 30.57, lng: 104.07 });
    const movement: DishJourneyMovement = {
      id: "m1",
      fromBeatId: "b1",
      toBeatId: "b2",
      label: "unsourced",
      confidence: "possible",
      source: null,
    };
    assert.equal(drawableMovements([from, to], [movement]).length, 0);
  });

  it("drops a movement whose other end has no coordinates", () => {
    const from = beat({ id: "b1", lat: 29.56, lng: 106.55 });
    const to = beat({ id: "b2" });
    const movement: DishJourneyMovement = {
      id: "m1",
      fromBeatId: "b1",
      toBeatId: "b2",
      label: "to an unknown place",
      confidence: "possible",
      source: src,
    };
    assert.equal(drawableMovements([from, to], [movement]).length, 0);
  });

  it("draws nothing when there are no movements at all", () => {
    const from = beat({ id: "b1", lat: 29.56, lng: 106.55 });
    const to = beat({ id: "b2", lat: 30.57, lng: 104.07 });
    assert.equal(drawableMovements([from, to], []).length, 0);
  });
});

describe("map framing — no invented pin, no guessed region", () => {
  it("frames a point chapter on that point", () => {
    const frame = frameForBeat(beat({ lat: 35.18, lng: 128.08 }));
    assert.deepEqual(frame.center, [128.08, 35.18]);
  });

  it("frames a broad regional chapter on its bounds", () => {
    const frame = frameForBeat(beat({ bounds: [124, 33, 131, 43.5] }));
    assert.deepEqual(frame.center, [127.5, 38.25]);
    // A broad region must be zoomed OUT, not framed like a city.
    assert.ok(frame.zoom < 4);
  });

  it("gives a geography-free chapter a wide, neutral frame", () => {
    const frame = frameForBeat(beat({}));
    assert.ok(frame.zoom <= 2);
  });
});

describe("map caption — the precision of the geography is stated", () => {
  it("says a city marker is not a place of invention", () => {
    const text = mapCaptionForBeat(
      beat({ placeName: "Jinju", lat: 35.18, lng: 128.08 }),
    );
    assert.ok(text.includes("not a place of invention"));
  });

  it("says a regional frame has no resolved location", () => {
    const text = mapCaptionForBeat(
      beat({ placeName: "Korea", bounds: [124, 33, 131, 43.5] }),
    );
    assert.ok(text.includes("exact record location unresolved"));
  });

  it("says plainly when no location was recorded", () => {
    const text = mapCaptionForBeat(beat({ placeName: "Ottoman Turkish" }));
    assert.ok(text.includes("no location recorded"));
  });
});
