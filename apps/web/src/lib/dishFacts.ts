/**
 * Building the facts table from what the API returned — WP-C2.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * Because the table is where the page makes CLAIMS about a dish, and a
 * claim that is not backed by data is the failure mode this whole
 * project cares about. So the mapping from the API's response to the
 * table's rows is pure data-in/data-out, with no JSX, and is tested
 * directly.
 *
 * THE RULE
 *
 * Every value comes from the response. Nothing is inferred, nothing is
 * defaulted to a plausible answer, and nothing is invented to fill a
 * row. Where the dish has no value for a fact, the row says "No
 * evidence" — which is a statement about the RECORD, not about the
 * dish.
 *
 * That last distinction is the one that matters. "No evidence" says
 * we looked and found no source. It does not say the dish has no
 * serving context, and it does not say the dish is served only at
 * home. The row is about the encyclopedia's state, and the wording
 * keeps it that way.
 */

import {
  DISH_FACT_KEYS,
  DISH_FACT_LABELS,
  DISH_FACT_MISSING,
  type DishFactKey,
  type DishFactRow,
} from "./dishSections.ts";
import { evidenceLabelText } from "./evidenceLabel.ts";
import { mayCarrySentence } from "./publicAssociationSentence.ts";

/** One dimension from the API's `dimensions` array. */
export interface DishDimension {
  vocabulary: string;
  valueId: string;
  slug: string;
  name: string;
  isPrimary: boolean;
}

/** One name from the API's `names` array (ADR-003 layer 2). */
export interface DishName {
  language: string;
  script: string | null;
  name: string;
  kind: string;
  isPrimary: boolean;
}

/** A place association, as the atlas returns it. */
export interface DishPlaceAssociation {
  slug?: string;
  name: string;
  /** The kind of association — "established tradition", "documentation", … */
  relationship?: string;
  /** The evidence status of the association. */
  status?: string;
}

/**
 * The vocabulary names the facts table reads.
 *
 * These are the API's own vocabulary keys. A dimension the dish does
 * not have simply does not appear in `dimensions`, so the mapping is a
 * lookup rather than a default.
 */
const FACT_VOCABULARY: Partial<Record<DishFactKey, string>> = {
  family: "family",
  servedAs: "serving",
  technique: "technique",
};

/**
 * The path a dimension's value links to, when it has a page.
 *
 * A family is a page (`/families/<slug>`); a technique and a serving
 * context are vocabulary values with no page of their own yet, so they
 * are plain text. Linking to a page that does not exist would be a
 * dead end, and the nav rule — "every link must reach real content" —
 * applies to the facts table too.
 */
function dimensionHref(
  fact: DishFactKey,
  dimension: DishDimension,
): string | undefined {
  if (fact === "family") {
    return `/families/${dimension.slug}`;
  }
  return undefined;
}

/**
 * The relationship kinds, in the words a reader would use.
 *
 * The API stores a machine key ("established_tradition"). The facts
 * table is prose, so the key is spelled out here rather than shown raw.
 *
 * "legacy_unreviewed" is the MIGRATION'S OWN label, not a claim that
 * the dish has an "unreviewed" relationship. It means: this row came
 * from the old places & traditions list and no source supports it yet.
 * So it reads as "Unverified association" — which is what the row
 * actually is — and the evidence badge beside it says the same thing.
 *
 * A key this table does not know is passed through unchanged, so a new
 * kind is visible on the page rather than silently dropped.
 */
const RELATIONSHIP_LABELS: Record<string, string> = {
  historical_emergence: "Historical emergence",
  established_tradition: "Established tradition",
  earliest_documentation: "Earliest documentation",
  regional_adaptation: "Regional adaptation",
  later_introduction: "Later introduction",
  legacy_unreviewed: "Unverified association",
};

export function relationshipLabel(relationship?: string): string | undefined {
  if (!relationship) return undefined;
  const known = RELATIONSHIP_LABELS[relationship];
  if (known) return known;
  // An unknown kind: humanise it rather than hide it.
  return relationship.replace(/_/g, " ");
}

/**
 * THE DISH'S OWN LANGUAGE — D21-13.
 *
 * The blueprint: "The dish's own language comes first in names. The
 * native-script name sits under the H1 (moussaka: μουσακάς) and is
 * included in 'Also called'. Today the Greek name is missing, while
 * Arabic, Hindi, Japanese and Chinese are shown."
 *
 * So the order of the names is a CLAIM about which language the dish
 * belongs to, and it is decided by where the dish comes from: the
 * language of its origin country.
 *
 * The mapping is by country ISO code, and it is deliberately SMALL:
 * only the languages the archive actually needs, so that every row in
 * it is one the team can vouch for. A country with no entry simply
 * keeps the API's order — the names are still shown, just not
 * re-ordered on a guess.
 */
/**
 * The origin country, and the language the dish is named in there.
 *
 * The mapping is deliberately narrow. A country does not have ONE
 * language: India has Hindi, Tamil, Bengali and Punjabi; Spain has
 * Castilian, Catalan and Basque; Switzerland has three official
 * languages and no single "own" one. A wrong guess here would put a
 * name in the wrong script under the dish's title, which is worse
 * than printing nothing.
 *
 * So the map lists only countries where one language is clearly the
 * culinary language of the dishes we hold, and the promotion below
 * still requires the record itself to carry a name in that language
 * AND in that language's own script. A country with several languages
 * is left out rather than guessed at.
 */
const ORIGIN_COUNTRY_LANGUAGE: Record<string, string> = {
  // Europe
  GR: "el", // Greece
  IT: "it", // Italy
  ES: "es", // Spain
  FR: "fr", // France
  DE: "de", // Germany
  AT: "de", // Austria
  PT: "pt", // Portugal
  NL: "nl", // Netherlands
  PL: "pl", // Poland
  CZ: "cs", // Czechia
  HU: "hu", // Hungary
  RO: "ro", // Romania
  HR: "hr", // Croatia
  BG: "bg", // Bulgaria
  SI: "sl", // Slovenia
  SK: "sk", // Slovakia
  UA: "uk", // Ukraine
  RU: "ru", // Russia
  // Americas
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  US: "en",
  // Africa and the Middle East
  EG: "ar",
  LB: "ar",
  SY: "ar",
  IQ: "ar",
  JO: "ar",
  SA: "ar",
  MA: "ar",
  DZ: "ar",
  TN: "ar",
  IL: "he",
  TR: "tr",
  IR: "fa",
  ET: "am",
  KE: "sw",
  // Asia
  IN: "hi",
  BD: "bn",
  LK: "si",
  CN: "zh",
  JP: "ja",
  KR: "ko",
  TH: "th",
  VN: "vi",
  ID: "id",
  MY: "ms",
  PH: "tl",
  KH: "km",
  LA: "lo",
  MN: "mn",
  // Oceania
  AU: "en",
  NZ: "en",
};

/**
 * The script a language is normally written in.
 *
 * This is the signal that tells a NAME AT HOME from a TRANSLATION.
 *
 * The `kind` field on a name says "endonym" for 743 of the 743
 * Latin-script names in a 200-dish sample — including "Moussaka" in
 * German and French, which is plainly not an endonym. The import
 * labelled every name in the block it copied. So `kind` cannot be
 * trusted, and the promotion below does not use it.
 *
 * The SCRIPT can be trusted, because it is a property of the string
 * itself: "寿司" is written in Japanese script whatever the row says
 * about it. Measured across the live corpus, 51 dishes carry a name
 * in their own language written in that language's own script — 寿司,
 * 비빔밥, मसाला दोसा, ผัดไทย, 麻婆豆腐 — and those are exactly the
 * names a reader should be shown as the dish's own.
 *
 * A language whose script is Latin (English, French, Italian) has no
 * script of its own to distinguish, so it is not listed here: a name
 * in those languages is not promoted on script grounds.
 */
const LANGUAGE_NATIVE_SCRIPT: Record<string, string> = {
  ar: "Arab",
  fa: "Arab",
  ur: "Arab",
  he: "Hebr",
  ja: "Jpan",
  zh: "Hans",
  hi: "Deva",
  mr: "Deva",
  ne: "Deva",
  bn: "Beng",
  si: "Sinh",
  ta: "Taml",
  te: "Telu",
  kn: "Knda",
  ml: "Mlym",
  gu: "Gujr",
  pa: "Guru",
  el: "Grek",
  ru: "Cyrl",
  uk: "Cyrl",
  bg: "Cyrl",
  sr: "Cyrl",
  mk: "Cyrl",
  ko: "Kore",
  th: "Thai",
  ka: "Geor",
  hy: "Armn",
  am: "Ethi",
  my: "Mymr",
  bo: "Tibt",
  lo: "Laoo",
  km: "Khmr",
  dv: "Thaa",
};

/**
 * The languages the bulk name import copied.
 *
 * Measured across the live corpus: 1,353 of 1,474 dishes carry English
 * only, and the remaining ~120 carry a block copied from this set --
 * a Turkish dish got Arabic, German, English, Spanish, French, Hindi,
 * Indonesian, Japanese, Portuguese and Chinese, and no Turkish.
 *
 * A name in one of these languages is therefore NOT evidence that the
 * dish has a name at home. It is evidence that the dish was copied into
 * a fixed translation set.
 *
 * A language OUTSIDE this set came from somewhere else -- a real name
 * record -- so a name in one of those is worth looking at.
 */
const BULK_IMPORT_LANGUAGES = new Set([
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "id",
  "ja",
  "pt",
  "zh",
]);

/**
 * Whether a name in this language can be the dish's name AT HOME.
 *
 * Two ways to qualify:
 *
 * 1. The language is written in a script that is not the Latin one, and
 *    the name is written in that script. "寿司" is written in Japanese
 *    script, so it is a Japanese name whatever the row claims about
 *    it. This is the check that keeps a bulk-imported translation from
 *    being promoted: a Chinese name of a Korean dish is in Chinese
 *    script, and it is not the dish's Korean name.
 *
 * 2. The language is outside the bulk-import set, so it was recorded
 *    rather than copied. A Vietnamese name of a Vietnamese dish is a
 *    name at home even though Vietnamese is written in the Latin
 *    script and the script cannot prove it.
 */
function isOwnLanguageName(name: DishName, language: string): boolean {
  const script = LANGUAGE_NATIVE_SCRIPT[language];
  if (script) return name.script === script;
  if (BULK_IMPORT_LANGUAGES.has(language)) return false;
  // A language outside the bulk set, written in the Latin script --
  // Vietnamese, Turkish, Italian, Hungarian. The name must still be
  // written in the Latin script: a Vietnamese name written in Chinese
  // script is a Chinese rendering of it, not a Vietnamese name.
  return name.script === "Latn";
}

/**
 * The dish's own language, when the record supports it.
 *
 * Returns undefined when the country is unknown, when the mapping has
 * no entry, or when the dish has no name in that language that can be
 * shown to be a name at home.
 *
 * The last condition is the one that matters. It is what keeps a
 * Turkish exonym out of a Greek dish's title slot, and what keeps a
 * bulk-imported translation from being promoted as the name at home.
 */
export function ownLanguage(
  names: DishName[],
  originIsoCode?: string | null,
): string | undefined {
  const iso = originIsoCode?.trim().toUpperCase();
  if (!iso) return undefined;
  const language = ORIGIN_COUNTRY_LANGUAGE[iso];
  if (!language) return undefined;
  const has = names.some(
    (n) =>
      n.language?.toLowerCase() === language.toLowerCase() &&
      isOwnLanguageName(n, language),
  );
  return has ? language : undefined;
}

/**
 * The dish's own name, in its own language and script.
 *
 * D21-13: "The native-script name sits under the H1 (moussaka:
 * μουσακάς) and is included in 'Also called'."
 *
 * It returns undefined when the dish has no name in its own language
 * written in its own script, or when that name is the SAME string as
 * the canonical name -- in which case printing it under the H1 would
 * just repeat the title.
 */
export function ownLanguageName(
  names: DishName[],
  canonicalName: string,
  originIsoCode?: string | null,
): { name: string; language: string; script: string | null } | undefined {
  const language = ownLanguage(names, originIsoCode);
  if (!language) return undefined;

  const own = names.filter(
    (n) =>
      n.language?.toLowerCase() === language.toLowerCase() &&
      isOwnLanguageName(n, language),
  );
  // The primary name of that language first.
  const sorted = [...own].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return 0;
  });

  for (const n of sorted) {
    const value = n.name?.trim();
    if (!value) continue;
    if (value.toLowerCase() === canonicalName.trim().toLowerCase()) continue;
    return { name: value, language, script: n.script ?? null };
  }
  return undefined;
}

/**
 * The "also called" names.
 *
 * A name is excluded when it is the SAME string as the dish's own
 * canonical name — "Moussaka; Moussaka" is noise.
 *
 * THE ORDER IS A CLAIM (D21-13).
 *
 * The names used to keep the API's order, which put the dish's own
 * language wherever it happened to fall — for moussaka, that meant
 * Arabic, Hindi, Japanese and Chinese were listed before anything
 * from Greece. The row now leads with the dish's OWN language, and
 * only then the others, so the first thing a reader meets is the name
 * the dish carries at home.
 *
 * The promotion happens ONLY when the dish really has a name in that
 * language. Where the data has no such name — the gap D21-13 names —
 * the row keeps the API's order rather than inventing a preference.
 */
export function alsoCalledNames(
  names: DishName[],
  canonicalName: string,
  originIsoCode?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const own = ownLanguage(names, originIsoCode);

  // The dish's own language first, in the API's order within it -- and
  // only the names that can be shown to be names AT HOME, so a
  // transliteration or a bulk-imported translation does not leap ahead
  // of the dish's real name.
  const isOwn = (n: DishName) =>
    own !== undefined &&
    n.language?.toLowerCase() === own.toLowerCase() &&
    isOwnLanguageName(n, own);

  const ordered = own
    ? [...names.filter(isOwn), ...names.filter((n) => !isOwn(n))]
    : names;

  for (const n of ordered) {
    const value = n.name?.trim();
    if (!value) continue;
    if (value.toLowerCase() === canonicalName.trim().toLowerCase()) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

/**
 * The primary dimension for a vocabulary.
 *
 * The API marks one value per vocabulary as primary. When several are
 * primary (data drift), the first wins — the order is stable, so the
 * rendering is stable too.
 */
export function primaryDimension(
  dimensions: DishDimension[],
  vocabulary: string,
): DishDimension | undefined {
  return dimensions.find((d) => d.vocabulary === vocabulary && d.isPrimary);
}

/**
 * Build the facts table.
 *
 * `associatedWith` is the one row that needs more than a dimension: it
 * is the place the dish belongs to, with the kind of association and
 * its evidence state. The places come from the atlas associations.
 */
export function buildDishFacts(input: {
  canonicalName: string;
  dimensions: DishDimension[];
  names: DishName[];
  places: DishPlaceAssociation[];
  /**
   * The ISO code of the dish's origin country ("GR", "TR", "IT").
   *
   * It decides which language is the dish's OWN, and so which name
   * leads the "Also called" row (D21-13). It comes from the legacy
   * origin value, which is discovery data -- but a language is not a
   * historical claim, and the row's ORDER only changes when the dish
   * really has a name in that language.
   */
  originIsoCode?: string | null;
  /** The evidence status of the whole dish, when it is unevidenced. */
  unevidenced?: boolean;
  /**
   * The preparation METHODS of the dish ("Fried & topped").
   *
   * A method is a TECHNIQUE, and the Technique row is where a technique
   * belongs. It used to be printed under the heading "Prepared
   * components", which promised something else entirely -- and the
   * components (the béchamel) were nowhere to be seen.
   */
  preparations?: { methodName: string }[];
}): DishFactRow[] {
  const rows: DishFactRow[] = [];

  for (const key of DISH_FACT_KEYS) {
    const label = DISH_FACT_LABELS[key];

    if (key === "associatedWith") {
      // THE FIRST PLACE THAT MAY BE STATED.
      //
      // This used to take `input.places[0]` -- whichever row the API
      // happened to put first. That row is often an UNEVIDENCED
      // legacy association, so the facts table could print a place
      // the site cannot state, and could print it while an evidenced
      // place sat further down the list.
      //
      // So the row picks the first place whose evidence allows it to
      // be stated, and if there is none, it says "No evidence" --
      // which is a statement about the RECORD, not about the dish.
      const place = input.places.find((p) => mayCarrySentence(p.status));
      if (!place) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      // The place name, the kind of association, and the evidence state.
      // The relation is the reason the dish belongs there, so it is
      // part of the value rather than a separate fact.
      const parts = [place.name];
      const kind = relationshipLabel(place.relationship);
      if (kind) parts.push(kind);
      rows.push({
        key,
        label,
        value: parts.join(" · "),
        href: place.slug ? `/place/${place.slug}` : undefined,
        // THE BADGE USES THE SITE'S OWN VOCABULARY.
        //
        // The row used to capitalise the raw status, which printed
        // "Research_pending" -- the underscore and all -- to a
        // reader. The evidence label is the one mapping from the
        // stored vocabulary to the four public words, and this row
        // now goes through it like every other badge on the site.
        evidence: place.status
          ? evidenceLabelText({ evidenceStatus: place.status })
          : undefined,
      });
      continue;
    }

    if (key === "alsoCalled") {
      const also = alsoCalledNames(
        input.names,
        input.canonicalName,
        input.originIsoCode,
      );
      if (also.length === 0) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      rows.push({ key, label, value: also.join(", ") });
      continue;
    }

    const vocabulary = FACT_VOCABULARY[key];
    if (!vocabulary) continue;

    // The technique row carries the dish's TECHNIQUE.
    //
    // It used to carry TWO things: the vocabulary dimension ("Frying")
    // and the preparation method ("Fried & topped"). The brief calls
    // that out -- "Clean up the technique row: it shows 'Frying,
    // Fried & topped', the same thing twice."
    //
    // They ARE the same thing. "Frying" is the controlled vocabulary
    // for how the dish is cooked; "Fried & topped" is the name the
    // preparation step carries, and it names the same cooking step in
    // the site's own words. Printing both says it twice.
    //
    // The vocabulary value WINS, for two reasons. It is the
    // controlled term, so it is the one that is consistent across
    // dishes and the one the Atlas filters on. And the preparation
    // method is only a fallback: a dish with a preparation but no
    // recorded technique dimension still has a technique, and saying
    // so is better than saying "No evidence".
    //
    // A missing fact and a fact that was checked and found unset are
    // different things to a reader, so the row is always present.
    if (key === "technique") {
      const dimension = primaryDimension(input.dimensions, vocabulary);
      const methods = (input.preparations ?? [])
        .map((p) => p.methodName?.trim())
        .filter((n): n is string => Boolean(n));
      const parts: string[] = [];
      if (dimension) {
        parts.push(dimension.name);
      } else {
        // No recorded technique dimension -- fall back to the
        // preparation method, but only if it does not already say
        // the same thing as another method.
        for (const method of methods) {
          if (!parts.includes(method)) parts.push(method);
        }
      }
      if (parts.length === 0) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      rows.push({
        key,
        label,
        value: parts.join(", "),
        href: dimension ? dimensionHref(key, dimension) : undefined,
      });
      continue;
    }

    const dimension = primaryDimension(input.dimensions, vocabulary);
    if (!dimension) {
      rows.push({ key, label, value: DISH_FACT_MISSING });
      continue;
    }
    rows.push({
      key,
      label,
      value: dimension.name,
      href: dimensionHref(key, dimension),
    });
  }

  return rows;
}
