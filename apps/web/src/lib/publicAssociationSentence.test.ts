import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_EVIDENCE_TEXT,
  mayCarrySentence,
  publicSentence,
} from "./publicAssociationSentence.ts";

/*
 * THE GENERATED-SENTENCE RULE.
 *
 * The dish page needs one sentence per association, and the
 * association's own `explanation` column cannot supply it -- that
 * column holds the DATABASE'S note about how the row got here (the
 * legacy import wrote "Migrated from the legacy origin_geo_id ...").
 *
 * So the page builds its own sentence. Built from the relationship
 * and the entity ALONE, that sentence is a filler:
 *
 *     "Associated with the Greek cuisine."
 *
 * It asserts nothing while reading as though it did. The brief says
 * "No generated filler sentence", and ATLAS_STYLE is blunter: an
 * Unverified item is "Not written as prose. It stays a gap; the facts
 * row shows 'No evidence'", and "The facts table never pads."
 *
 * So the rule is: a sentence is generated only when there is a
 * finding to state.
 */

describe("publicSentence — the one public sentence", () => {
  it("does NOT generate a filler for an unevidenced association", () => {
    // The exact live case: moussaka-greek -> "Greek cuisine".
    const sentence = publicSentence({
      relationship: "legacy_unreviewed",
      entityKind: "community",
      name: "Greek cuisine",
      isoCode: null,
      evidenceStatus: "unevidenced",
    });
    assert.equal(
      sentence,
      null,
      "an unevidenced association has no finding to state, so it gets no sentence",
    );
  });

  it("states a sentence for an association that HAS a finding", () => {
    const sentence = publicSentence({
      relationship: "similar_form",
      entityKind: "place",
      name: "Greece",
      isoCode: "GR",
      evidenceStatus: "evidenced",
    });
    assert.equal(sentence, "Associated with Greece.");
  });

  it("keeps a community a community, and a place a place", () => {
    // "Associated with the Greek cuisine" for a COMMUNITY; "Associated
    // with Greece" for a PLACE. Swapping them would make a tradition
    // read as a claim about a country.
    const community = publicSentence({
      relationship: "similar_form",
      entityKind: "community",
      name: "Greek cuisine",
      evidenceStatus: "evidenced",
    });
    const place = publicSentence({
      relationship: "similar_form",
      entityKind: "place",
      name: "Greece",
      isoCode: "GR",
      evidenceStatus: "evidenced",
    });
    assert.equal(community, "Associated with the Greek cuisine.");
    assert.equal(place, "Associated with Greece.");
  });

  it("falls back to 'this dish' when the association has no name", () => {
    const sentence = publicSentence({
      relationship: "similar_form",
      entityKind: "place",
      name: null,
      evidenceStatus: "evidenced",
    });
    assert.equal(sentence, "Associated with this dish.");
  });

  it("treats a MISSING evidence status as a GAP, not a finding", () => {
    // The status is optional on the type, so a caller that does not
    // know the status must not silently blank the row.
    //
    // The rule is "never state what you cannot show", so an ABSENT
    // status is a gap: the sentence is suppressed. A missing
    // status is not a licence to state the claim -- it is the
    // absence of the permission to state it.
    const sentence = publicSentence({
      relationship: "similar_form",
      entityKind: "place",
      name: "Greece",
      evidenceStatus: "evidenced",
    });
    assert.equal(sentence, "Associated with Greece.");
  });
});

describe("mayCarrySentence — which statuses may carry prose", () => {
  it("carries prose only for `evidenced`", () => {
    // The stored `evidence_status` enum is exactly four values:
    // unevidenced | research_pending | provisional | evidenced.
    // Only the last one is a finding the site may state.
    assert.equal(mayCarrySentence("evidenced"), true);
    for (const status of [
      "unevidenced",
      "research_pending",
      "provisional",
    ]) {
      assert.equal(
        mayCarrySentence(status),
        false,
        `${status} is a stage BEFORE a finding, not a finding`,
      );
    }
  });

  it("fails CLOSED on an unknown or missing status", () => {
    // The rule is "never state what you cannot show". A status this
    // site does not know must be a gap, not a licence.
    assert.equal(mayCarrySentence("documented"), false);
    assert.equal(mayCarrySentence("probably"), false);
    assert.equal(mayCarrySentence(""), false);
    assert.equal(mayCarrySentence(null), false);
    assert.equal(mayCarrySentence(undefined), false);
  });
});

describe("NO_EVIDENCE_TEXT", () => {
  it("is the honest empty state, and says so in ATLAS_STYLE's words", () => {
    // ATLAS_STYLE: "the facts row shows 'No evidence'". Not "Unknown",
    // not "N/A", and not a sentence about the dish.
    assert.equal(NO_EVIDENCE_TEXT, "No evidence");
  });
});
