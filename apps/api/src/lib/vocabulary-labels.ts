import { db, vocabularyLabels } from "@gustale/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * ADR-003 layer 1 — the vocabulary labels.
 *
 * Every controlled-vocabulary label is translated once per locale, not
 * per use. The English label stays in each vocabulary's own base table,
 * so a lookup for the requested locale falls back to the base label
 * when there is no translation.
 *
 * The fallback is deliberate and is the ADR's "English fallback with
 * notice" behaviour: the caller is told which locale was actually
 * served, so the UI can show the notice rather than silently showing
 * English under a Spanish URL.
 */

/** The core locale set. English is the base tables' own label. */
export const CORE_LOCALES = [
  "en",
  "es",
  "de",
  "fr",
  "pt",
  "id",
  "zh",
  "ja",
  "ar",
  "hi",
] as const;

/** The locales a dish page can be served in. */
export const SUPPORTED_LOCALES = CORE_LOCALES;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * A BCP-47 language tag: two or three letters, then optional
 * subtags.
 *
 * The ADR says the core set is "a floor, not a ceiling: the per-dish
 * language rule can add locales the core set omits." The dish names
 * already prove it - a dish has a name in Tagalog, Vietnamese, Korean,
 * Greek, Thai and more, and a request for those must be served.
 *
 * So a locale is valid if it is well-formed BCP-47, not only if it is
 * in the core list. The core list is what the site guarantees to have
 * labels for; anything else falls back per-value, and the API reports
 * the locale it served so the client can show the notice.
 */
const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isValidLocale(value: string): boolean {
  return BCP47.test(value);
}

/**
 * Pick the best locale for a request.
 *
 * The requested language wins if it is well-formed. Otherwise the base
 * "en" is used, and the caller shows the fallback notice.
 */
export function resolveLocale(requested?: string): string {
  if (requested && isValidLocale(requested)) return requested;
  return "en";
}

export type VocabularyLabel = {
  vocabulary: string;
  valueId: string;
  language: string;
  name: string;
  isPrimary: boolean;
  source: string | null;
  sourceRef: string | null;
};

/**
 * Fetch the labels for a set of values of one vocabulary, in one locale.
 *
 * One query per (vocabulary, locale) rather than one per value: a dish
 * page needs the labels for its families, its techniques, its cuisines
 * and so on, and a page has perhaps twenty values in total. Asking per
 * value would be twenty round-trips for the same answer.
 */
export async function fetchVocabularyLabels(
  vocabulary: string,
  valueIds: string[],
  language: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (valueIds.length === 0 || language === "en") {
    // English is the base table's own label; there is nothing to fetch.
    return out;
  }

  const rows = await db
    .select({
      valueId: vocabularyLabels.valueId,
      name: vocabularyLabels.name,
      isPrimary: vocabularyLabels.isPrimary,
    })
    .from(vocabularyLabels)
    .where(
      and(
        eq(vocabularyLabels.vocabulary, vocabulary),
        eq(vocabularyLabels.language, language),
        inArray(vocabularyLabels.valueId, valueIds),
      ),
    );

  for (const row of rows) {
    // A value can have several labels in a language; the primary one
    // wins, and a non-primary is only used if no primary was found.
    const existing = out.get(row.valueId);
    if (existing === undefined || row.isPrimary) {
      out.set(row.valueId, row.name);
    }
  }
  return out;
}

/**
 * The labels available for a vocabulary, by locale — used to tell the
 * caller which locales a page can actually be served in.
 */
export async function fetchVocabularyLocales(
  vocabulary: string,
  valueIds: string[],
): Promise<string[]> {
  if (valueIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ language: vocabularyLabels.language })
    .from(vocabularyLabels)
    .where(
      and(
        eq(vocabularyLabels.vocabulary, vocabulary),
        inArray(vocabularyLabels.valueId, valueIds),
      ),
    );
  return rows.map((r) => r.language);
}
