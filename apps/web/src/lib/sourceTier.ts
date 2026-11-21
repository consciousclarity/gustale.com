/**
 * THE SOURCE TIER, IN PUBLIC WORDS (D21-12).
 *
 * The brief: "Sources: show each source's tier in public words. A
 * Wikipedia entry reads 'Reference · supports the definition only'."
 *
 * The site grades its sources S1..S7 (GUS-026 §3, the `source_class`
 * enum). Those codes are the right mechanism and the wrong public
 * vocabulary: a reader has no way to know what "S6" means, and an
 * unexplained letter is exactly the kind of thing the Atlas style
 * rules are against.
 *
 * So the codes are TRANSLATED here, once, and the translation is
 * part of the site's vocabulary rather than a string built at the
 * call site.
 *
 * The wording is deliberately about what the source IS, not about
 * how much the site trusts it. "Primary historical" says what the
 * source is; "the best kind of source" would be a claim about the
 * claim, which is the evidence badge's job.
 *
 * S6 and S7 are the two the reader most needs to recognise, because
 * they are the classes that cannot carry a contested claim on their
 * own:
 *
 *   S6 reference   -- "Reference". Wikipedia, Wikidata, general
 *                     publications. A starting point for a reader, and
 *                     discovery for the site. Never the sole basis
 *                     for a contested origin claim.
 *   S7 unverified  -- "Unverified". Blogs, AI-generated text,
 *                     unattributed material. The site's own word for
 *                     it is the same word it uses for an unevidenced
 *                     claim, which is the point.
 *
 * And the rule for each of them is STATED, not implied, because a
 * reader who cannot see it will read a Wikipedia citation as a
 * citation of the claim. The clauses are the policy's own wording;
 * see SOURCE_TIER_CLAUSES below for why S6 says "discovery and
 * terminology" rather than the narrower "supports the definition
 * only" that this file used to carry.
 */

import type { SourceClass } from "../types/dish.ts";

/** The public name of each source class. */
export const SOURCE_TIER_WORDS: Record<SourceClass, string> = {
  S1: "Primary historical",
  S2: "Scholarly",
  S3: "Institutional",
  S4: "Practitioner",
  S5: "Specialist",
  S6: "Reference",
  S7: "Unverified",
};

/**
 * The extra clause each discovery-class source carries.
 *
 * The wording is the SOURCE-CLASS POLICY's own wording, not a
 * paraphrase of it. `docs/SOURCE-TIER-LIST.md` says of S6:
 *
 *   "general reference works and encyclopaedias, used for
 *    discovery and terminology ... Never the sole basis for a claim."
 *
 * and of S7: material "whose authorship or editorial process cannot
 * be established", recorded "without being usable".
 *
 * THE S6 CLAUSE IS ABOUT DISCOVERY, NOT ABOUT SUPPORT.
 *
 * An earlier version of this file said S6 "supports the definition
 * only". That was the brief's example, and it is narrower than the
 * policy: S6 is "discovery and terminology", which covers finding the
 * dish, getting its name in the right language, and identifying the
 * article -- not only the definition. It also reads as a promise that
 * an S6 source DOES support a definition, which is a claim about a
 * claim and is not what the policy says. The policy says S6 is "a
 * tier of provenance", and "never the sole basis for a claim".
 *
 * The S7 clause previously said "cannot support a claim on its own",
 * which implies that it CAN support one alongside another source.
 * The policy excludes that: S7 is a QUARANTINE class. It is not
 * weaker evidence, it is material that is not usable as evidence.
 */
export const SOURCE_TIER_CLAUSES: Partial<Record<SourceClass, string>> = {
  S6: "for discovery and terminology, not for a claim on its own",
  S7: "not usable as evidence",
};

/**
 * The public wording of a source's tier.
 *
 * Returns the tier's public name, plus its clause when it has one.
 * A source with no class, or with a class this site does not know,
 * says so honestly rather than being given a tier it does not have.
 */
export function sourceTierWords(
  sourceClass: SourceClass | string | null | undefined,
): string {
  if (!sourceClass) return "Not classified";

  // The parameter is wider than the enum because the value arrives
  // from the API as an untyped JSON field. So it is NARROWED here,
  // once, against the enum -- rather than the tables being widened
  // back to `string` to make the lookup compile. A table typed
  // `Record<string, string>` cannot tell a typo from a real class.
  if (!isSourceClass(sourceClass)) return "Not classified";

  const name = SOURCE_TIER_WORDS[sourceClass];
  const clause = SOURCE_TIER_CLAUSES[sourceClass];
  return clause ? `${name} · ${clause}` : name;
}

/**
 * Whether a value is one of the source classes the site knows.
 *
 * The check is against the TABLE, not a hand-written list, so a class
 * cannot be added to the wording without being added to the enum.
 */
export function isSourceClass(
  value: string | null | undefined,
): value is SourceClass {
  return !!value && Object.prototype.hasOwnProperty.call(SOURCE_TIER_WORDS, value);
}

/*
 * There is deliberately NO `isDiscoveryOnly` helper here.

 * An earlier version of this file exported one, on the claim that
 * "the content gate and the evidence rules" used it. Neither did:
 * the content gate is `scripts/check_content_gate.py`, which works
 * on the dish's TEXT and knows nothing about source classes, and
 * the evidence rules live in the database. A helper with no
 * callers and a comment naming callers that do not exist is a
 * trap for the next reader, so it is gone rather than left
 * waiting for a caller.
 */
