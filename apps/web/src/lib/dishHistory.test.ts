import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DishJourneyBeat } from "./api.ts";
import {
  claimRowLabel,
  claimRowSourceNote,
  claimRowText,
} from "./dishHistory.ts";

const beat = (over: Partial<DishJourneyBeat> = {}): DishJourneyBeat => ({
  id: "b1",
  sequence: 1,
  placeName: "Greece",
  lat: null,
  lng: null,
  yearApprox: null,
  label: "Chapter",
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
  ...over,
});

describe("claimRowLabel", () => {
  it("prefers the date label", () => {
    const b = beat({
      dateLabel: "1920s",
      title: "The béchamel form",
      label: "L",
    });
    assert.equal(claimRowLabel(b), "1920s");
  });

  it("falls back to the editorial title", () => {
    const b = beat({ title: "The béchamel form", label: "L" });
    assert.equal(claimRowLabel(b), "The béchamel form");
  });

  it("falls back to the chapter's own label", () => {
    assert.equal(claimRowLabel(beat({ label: "Name" })), "Name");
  });

  it("ignores a blank date label", () => {
    const b = beat({ dateLabel: "   ", title: "Real title" });
    assert.equal(claimRowLabel(b), "Real title");
  });
});

describe("claimRowText", () => {
  it("is the claim", () => {
    const b = beat({ title: "The name is borrowed, through Turkish." });
    assert.equal(claimRowText(b), "The name is borrowed, through Turkish.");
  });

  it("falls back to the chapter label when there is no headline", () => {
    assert.equal(claimRowText(beat({ label: "Before 1900" })), "Before 1900");
  });
});

describe("claimRowSourceNote", () => {
  it("says how many sources are attached", () => {
    const b = beat({
      evidenceKind: "reference_work",
      source: {
        id: "s1",
        title: "A book",
        url: null,
        citationText: null,
        year: null,
        reliability: null,
      },
    });
    assert.equal(claimRowSourceNote(b), "reference work · 1 source attached");
  });

  it("says '0 sources attached' rather than showing a bare zero", () => {
    const b = beat({ evidenceKind: "primary_record" });
    assert.equal(claimRowSourceNote(b), "primary record · 0 sources attached");
  });

  it("names the place when there is no evidence kind", () => {
    const b = beat({ placeName: "Greece" });
    assert.equal(claimRowSourceNote(b), "Greece · 0 sources attached");
  });
});
