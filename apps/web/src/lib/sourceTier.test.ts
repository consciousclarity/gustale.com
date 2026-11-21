import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SourceClass } from "../types/dish.ts";
import { SOURCE_TIER_WORDS, sourceTierWords } from "./sourceTier.ts";

/**
 * THE SOURCE TIER, IN PUBLIC WORDS.
 *
 * The rules these tests hold:
 *
 *   1. Every class the database can store has a public name.
 *   2. A source with no class says so -- it is never given a tier it
 *      does not have.
 *   3. The two DISCOVERY classes carry a clause, because a reader who
 *      cannot see that a citation cannot carry a claim will read it
 *      as a citation OF the claim.
 *   4. The clauses are the source-class policy's own wording, not a
 *      paraphrase that overstates what a class can do.
 */
describe("sourceTierWords — the public wording of a source's tier", () => {
  it("names every class the `source_class` enum can hold", () => {
    // The enum is S1..S7. If the enum grows and this list does not,
    // the new class silently renders as "Not classified" -- which is
    // honest but wrong, because it HAS a class.
    const ALL: readonly SourceClass[] = [
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
    ];
    for (const cls of ALL) {
      assert.ok(SOURCE_TIER_WORDS[cls], `${cls} must have a public name`);
      assert.notEqual(
        sourceTierWords(cls),
        "Not classified",
        `${cls} must not degrade to the unclassified wording`,
      );
    }
  });

  it("says so honestly when a source has no class", () => {
    for (const value of [null, undefined, "", "S9", "nonsense"]) {
      assert.equal(
        sourceTierWords(value),
        "Not classified",
        `${String(value)} is not a tier the site knows`,
      );
    }
  });

  it("states the tier's NAME for a tier that carries no clause", () => {
    // S1..S5 are evidence tiers. What they are says what they are
    // worth; a clause would be a claim about the claim.
    const EVIDENCE: readonly SourceClass[] = ["S1", "S2", "S3", "S4", "S5"];
    for (const cls of EVIDENCE) {
      assert.equal(
        sourceTierWords(cls),
        SOURCE_TIER_WORDS[cls],
        `${cls} carries only its name`,
      );
    }
  });

  it("gives S6 the DISCOVERY clause, not a claim of support", () => {
    // The policy: S6 is "discovery and terminology", "never the sole
    // basis for a claim", and "a tier of provenance". An earlier
    // version said "supports the definition only", which is narrower
    // than the policy and reads as a promise that the source DOES
    // support the definition.
    const wording = sourceTierWords("S6");
    assert.ok(wording.startsWith("Reference"), `got ${wording}`);
    assert.match(wording, /discovery/i, "S6 must say what it is for");
    assert.doesNotMatch(
      wording,
      /supports the definition only/i,
      "the narrower wording overstates what S6 can do",
    );
  });

  it("gives S7 the QUARANTINE clause", () => {
    // The policy calls S7 a quarantine class: material "recorded
    // without being usable". An earlier version said "cannot support
    // a claim on its own", which implies it CAN support one alongside
    // another source. The policy excludes that.
    const wording = sourceTierWords("S7");
    assert.ok(wording.startsWith("Unverified"), `got ${wording}`);
    assert.match(
      wording,
      /not usable as evidence/i,
      "S7 must not imply it can contribute evidence",
    );
    assert.doesNotMatch(
      wording,
      /on its own/i,
      "'on its own' implies S7 can contribute alongside another source",
    );
  });
});
