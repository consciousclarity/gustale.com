/**
 * Dish journey REVIEW FIXTURES (GUS-238).
 *
 * ── READ THIS FIRST ─────────────────────────────────────────────────────
 *
 * These are NOT production content and NOT approved editorial records.
 * They are review material: the five documented cases from the design
 * pack, transcribed so the new presentation can be exercised and
 * reviewed end to end without touching the live database.
 *
 * The rules the pack set, and this file keeps:
 *
 *   * Every chapter carries the SOURCE it came from, the BIBLIOGRAPHIC
 *     LOCATOR, and the INSPECTION STATUS — whether the original record
 *     was read directly or reported through another author. A chapter
 *     whose original was never inspected says so.
 *   * A date attestation is not an invention date.
 *   * A research gap is a gap. Century egg & tofu and beyaynetu have
 *     NO chapters, because neither preserved-egg history nor injera and
 *     teff history dates the complete dish. They get an explicit gap
 *     state and no invented map.
 *   * A movement appears only where a source supports it. The Bibimbap
 *     and hot-pot fixtures carry attributed, schematic circulation
 *     edges; the moussaka fixture carries none, because its three
 *     records are three different KINDS of evidence and no migration
 *     route follows from them.
 *   * Nothing here is published. These fixtures are only ever read by
 *     the review harness.
 *
 * The transcription follows `journey-content-notes.md` from the
 * reference pack, including which originals were inspected.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  DishJourneyBeat,
  DishJourneyLineage,
  DishJourneyMovement,
} from "./api";

export interface JourneyFixture {
  slug: string;
  status: "history" | "gap";
  title: string;
  intro: string;
  beats: DishJourneyBeat[];
  movements: DishJourneyMovement[];
  lineages: DishJourneyLineage[];
  /** The gap copy, when the case is a research gap. */
  gapNote?: string;
}

/** Stable synthetic ids — fixtures never collide with real UUIDs. */
let seq = 0;
const fid = (prefix: string): string => `${prefix}-fixture-${++seq}`;

const beat = (
  b: Partial<DishJourneyBeat> & Pick<DishJourneyBeat, "placeName" | "label">,
): DishJourneyBeat => ({
  id: fid("beat"),
  sequence: 0,
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
  ...b,
});

// ─── Bibimbap — six records ──────────────────────────────────────────────
//
// Sources: Mun, Lee & Cha 2023 (Journal of Ethnic Foods); Hwang
// Hye-seong, Encyclopedia of Korean Culture; Academy of Korean Studies
// 2025; Joo Young-ha 2010. Originals NOT inspected for the scholarly
// interpretations — that is recorded per chapter.

const BIBIMBAP: JourneyFixture = {
  slug: "bibimbap",
  status: "history",
  title: "Korean roots. A bowl that kept changing.",
  intro:
    "From rice mixed before serving to toppings mixed by the eater: follow changes in preparation, regional identity and circulation. The precise birthplace and invention date remain unresolved.",
  beats: [
    beat({
      sequence: 1,
      title: "A Korean name appears in an early text.",
      placeName: "Korea — name attestation",
      dateLabel: "1810 · historical name record",
      datePrecision: "exact",
      yearApprox: 1810,
      evidenceKind: "scholarly_interpretation",
      confidence: "documented",
      placeRole: "attestation",
      bounds: [124.0, 33.0, 131.0, 43.5],
      regions: ["Korea"],
      label:
        "A scholarly review identifies a Hangul form of bibimbap’s name in Jang Hon’s Mongyupyeon, dated 1810. This is a historical name attestation, not evidence that the dish was invented in that year.",
      authors: "Mun, Eun-Gyung; Lee, Young-Eun; Cha, Youn-Soo",
      locator: "Journal of Ethnic Foods 10, 39 (2023), historical section",
      source: {
        id: fid("src"),
        title:
          "The globalization of bibimbap: focusing on the diversity of modernization of bibimbap",
        url: "https://link.springer.com/article/10.1186/s42779-023-00195-2",
        citationText:
          "Mun, Lee & Cha (2023). The globalization of bibimbap. Journal of Ethnic Foods 10, 39.",
        year: 2023,
        reliability: "secondary",
      },
      scopeNote:
        "The review was inspected; Jang Hon’s Mongyupyeon was not. The 1810 name record is a dated reference, not the dish’s beginning — earlier antecedents need separate verification.",
    }),
    beat({
      sequence: 2,
      title: "The cook mixes the bowl before serving.",
      placeName: "Korea — culinary manuscript",
      dateLabel: "Late 19th century · recipe record",
      datePrecision: "century",
      yearApprox: 1880,
      evidenceKind: "reference_work",
      confidence: "likely",
      placeRole: "preparation_context",
      bounds: [124.0, 33.0, 131.0, 43.5],
      regions: ["Korea"],
      label:
        "Siuijeonseo records rice mixed with prepared meat, vegetables, sesame seasoning and oil, then finished with egg and meatball garnishes — a preparation mixed before serving, unlike the bowl mixed at the table today.",
      authors: "Hwang Hye-seong",
      locator: "Encyclopedia of Korean Culture, “Bibimbap”, Content section",
      source: {
        id: fid("src"),
        title: "Bibimbap — Encyclopedia of Korean Culture",
        url: "https://encykorea.aks.ac.kr/Article/E0025157",
        citationText:
          "Hwang Hye-seong. “Bibimbap.” Encyclopedia of Korean Culture, Academy of Korean Studies.",
        year: 2023,
        reliability: "secondary",
      },
      scopeNote:
        "The encyclopedia entry was inspected; the Siuijeonseo manuscript was not. The entry’s older “first appearance” claim is not adopted here, because newer research identifies earlier records.",
    }),
    beat({
      sequence: 3,
      title: "Mixed over heat, rather than simply assembled.",
      placeName: "Korea — cookbook preparation",
      dateLabel: "1921 · cookbook preparation",
      datePrecision: "exact",
      yearApprox: 1921,
      evidenceKind: "scholarly_interpretation",
      confidence: "likely",
      placeRole: "preparation_context",
      bounds: [124.0, 33.0, 131.0, 43.5],
      regions: ["Korea"],
      label:
        "Vegetables are heated in a pot and then stirred with rice and seasonings — the mixed-over-heat preparation recorded in a 1921 Joseon yori jebeop.",
      authors: "Academy of Korean Studies",
      locator:
        "The Birth of K-Food: History of 20th Century Korean Food, section 2",
      source: {
        id: fid("src"),
        title: "The Birth of K-Food: History of 20th Century Korean Food",
        url: "https://www.aks.ac.kr/cefia/webzine/2505/focus_eng.html",
        citationText:
          "Academy of Korean Studies (2025). The Birth of K-Food, section 2.",
        year: 2025,
        reliability: "secondary",
      },
      scopeNote:
        "The Academy’s account was inspected; the 1921 cookbook was not. This records a different preparation, not proof that all bowls followed one linear development.",
    }),
    beat({
      sequence: 4,
      title: "A topping arrangement is recorded.",
      placeName: "Jinju — regional preparation",
      dateLabel: "1929 · regional preparation recorded",
      datePrecision: "exact",
      yearApprox: 1929,
      evidenceKind: "scholarly_interpretation",
      confidence: "likely",
      placeRole: "regional_identity",
      lat: 35.18,
      lng: 128.08,
      bounds: [125.5, 34.5, 129.0, 36.5],
      regions: ["Jinju", "Korea"],
      label:
        "A 1 December 1929 account from Jinju describes the topping arrangement with raw beef and gochujang — a regional preparation recorded alongside the earlier mixed-over-heat form.",
      authors: "Academy of Korean Studies",
      locator: "The Birth of K-Food, section 2 (Byeolgeon’gon, 1 Dec 1929)",
      source: {
        id: fid("src"),
        title: "The Birth of K-Food: History of 20th Century Korean Food",
        url: "https://www.aks.ac.kr/cefia/webzine/2505/focus_eng.html",
        citationText:
          "Academy of Korean Studies (2025). The Birth of K-Food, section 2.",
        year: 2025,
        reliability: "secondary",
      },
      scopeNote:
        "The Academy’s account was inspected; the 1929 periodical was not. Jinju is recorded here as a place a preparation was documented — not as an invention site.",
    }),
    beat({
      sequence: 5,
      title: "Regional styles circulate nationally.",
      placeName: "Jeonju and Seoul — wider circulation",
      dateLabel: "1970s–early 1980s · wider circulation",
      datePrecision: "decade",
      yearApprox: 1975,
      evidenceKind: "scholarly_interpretation",
      confidence: "possible",
      placeRole: "circulation",
      lat: 36.0,
      lng: 127.9,
      bounds: [125.5, 34.5, 129.5, 38.7],
      regions: ["Jeonju", "Seoul", "Korea"],
      label:
        "Jeonju style’s national recognition in the early 1980s is interpreted alongside the growth of the rice-and-side-dish meal in cities.",
      authors: "Joo Young-ha",
      locator: "Society and History 87 (2010), pp. 5–38",
      source: {
        id: fid("src"),
        title: "A Study on Evolution and Discourse of Bibimbab",
        url: "https://kiss.kstudy.com/Detail/Ar?key=3462236",
        citationText:
          "Joo Young-ha (2010). A Study on Evolution and Discourse of Bibimbab. Society and History 87, pp. 5–38.",
        year: 2010,
        reliability: "secondary",
      },
      scopeNote:
        "The Korean and English abstracts were inspected; the full article was not accessed. The Jeonju–Seoul connection is an attributed schematic circulation, not a reconstructed route.",
    }),
    beat({
      sequence: 6,
      title: "The dish is adopted abroad.",
      placeName: "Japan — overseas reception",
      dateLabel: "Late 1990s · overseas circulation",
      datePrecision: "decade",
      yearApprox: 1997,
      evidenceKind: "scholarly_interpretation",
      confidence: "possible",
      placeRole: "reception",
      lat: 35.68,
      lng: 139.69,
      bounds: [129.0, 31.0, 146.0, 45.5],
      regions: ["Japan", "Korea"],
      label:
        "Overseas circulation, including adoption in Japan in the late 1990s, is interpreted in the same historical study.",
      authors: "Joo Young-ha",
      locator: "Society and History 87 (2010), pp. 5–38",
      source: {
        id: fid("src"),
        title: "A Study on Evolution and Discourse of Bibimbab",
        url: "https://kiss.kstudy.com/Detail/Ar?key=3462236",
        citationText:
          "Joo Young-ha (2010). A Study on Evolution and Discourse of Bibimbab. Society and History 87, pp. 5–38.",
        year: 2010,
        reliability: "secondary",
      },
      scopeNote:
        "Abstracts inspected; the full article was not accessed. This is a country-level reception claim at a broad period, not a first-arrival date.",
    }),
  ],
  movements: [],
  lineages: [],
};

// ─── Moussaka — three bounded records ────────────────────────────────────

const MOUSSAKA: JourneyFixture = {
  slug: "moussaka-greek",
  status: "history",
  title: "A layered bake, and three very different kinds of evidence.",
  intro:
    "A nineteenth-century recipe, a later interpretation of how the dish developed in Greece, and a twentieth-century account of British readership. No route follows from records of these different kinds.",
  beats: [
    beat({
      sequence: 1,
      title: "A recipe for muzakka is printed.",
      placeName: "Ottoman Turkish — culinary context",
      dateLabel: "1864 edition · recipe record",
      datePrecision: "exact",
      yearApprox: 1864,
      evidenceKind: "primary_record",
      confidence: "documented",
      placeRole: "preparation_context",
      lat: 41.0,
      lng: 29.0,
      bounds: [26.0, 36.0, 45.0, 42.5],
      regions: ["Ottoman Empire"],
      label:
        "Recipe 106 “Muzakka” layers minced mutton and eggplant and simmers them in broth. No béchamel appears.",
      authors: "Turabi Efendi",
      locator: "Turkish Cookery Book, recipe 106, pp. 35–36",
      source: {
        id: fid("src"),
        title: "Turkish Cookery Book",
        url: "https://archive.org/details/b21527830/page/n53/mode/1up",
        citationText:
          "Turabi Efendi. Turkish Cookery Book. 1864 edition, recipe 106 “Muzakka”, pp. 35–36.",
        year: 1864,
        reliability: "primary",
      },
      scopeNote:
        "The edition metadata, the OCR recipe text and the printed-page/scan mapping were inspected directly. The title’s 1862 banquet context is not the 1864 edition date, and London publication is not London origin.",
    }),
    beat({
      sequence: 2,
      title: "A béchamel-topped form is interpreted.",
      placeName: "Greece — early 20th-century development",
      dateLabel: "Early 20th century · interpreted development",
      datePrecision: "century",
      yearApprox: 1920,
      evidenceKind: "scholarly_interpretation",
      confidence: "likely",
      placeRole: "preparation_context",
      lat: 38.0,
      lng: 23.7,
      bounds: [19.0, 34.8, 29.5, 41.8],
      regions: ["Greece"],
      label:
        "An interpretation of the dish’s early development in Greece discusses Tselementes’ cookbook and the familiar béchamel-topped form.",
      authors: "Aglaia Kremezi",
      locator: "“Moussaka: not so classic a dish”",
      source: {
        id: fid("src"),
        title: "Moussaka: not so classic a dish",
        url: "https://neoskosmos.com/en/2011/03/23/life/food-drink/moussaka-aglaia-kremezi/",
        citationText:
          "Kremezi, Aglaia. “Moussaka: not so classic a dish.” Neos Kosmos, 23 March 2011.",
        year: 2011,
        reliability: "secondary",
      },
      scopeNote:
        "The article was inspected; the cookbook it discusses was not. No exact invention year, exclusive inventor, or direct route from recipe 106 is claimed.",
    }),
    beat({
      sequence: 3,
      title: "A British cookbook prints the dish.",
      placeName: "Britain — cookery reception",
      dateLabel: "1950 · cookery reception",
      datePrecision: "exact",
      yearApprox: 1950,
      evidenceKind: "scholarly_interpretation",
      confidence: "documented",
      placeRole: "reception",
      lat: 50.8,
      lng: -0.12,
      bounds: [-8.0, 49.5, 2.0, 59.0],
      regions: ["Britain"],
      label:
        "Elizabeth David’s A Book of Mediterranean Food is described as naming moussaka among its recipes — readership and reception in British cooking.",
      authors: "Louise Peskett",
      locator: "Brighton & Hove Museums, “Trailblazer”",
      source: {
        id: fid("src"),
        title:
          "Trailblazer: cooking writer Elizabeth David — changing the way a nation eats",
        url: "https://brightonmuseums.org.uk/discovery/history-stories/trailblazer-cooking-writer-elizabeth-david-changing-the-way-a-nation-eats/",
        citationText:
          "Peskett, Louise. “Trailblazer: cooking writer Elizabeth David.” Brighton & Hove Museums.",
        year: 1950,
        reliability: "secondary",
      },
      scopeNote:
        "The museum account was inspected; the first edition was not. This is historical readership and reception — not British origin and not first arrival.",
    }),
  ],
  // No movements: the three records are three different KINDS of
  // evidence. A migration line between them would be invented.
  movements: [],
  lineages: [
    // The lineage membership EXISTS in the live database — the live
    // journey API returns `stuffed-leaves` for moussaka-greek. What the
    // live database does NOT yet carry is the role, the explanation or
    // the related-dish list, because those fields come with GUS-238.
    //
    // For REVIEW, this fixture shows what the section looks like with
    // a real lineage. The role is the conservative one: a dish that is
    // a member of a culinary grouping is recorded as a cousin, never
    // as an ancestor, unless the data says so.
    {
      slug: "stuffed-leaves",
      name: "Stuffed Leaves and Vegetables",
      shortDescription:
        "Dishes built around leaves and vegetables filled with a seasoned mixture.",
      longDescription: null,
      conceptSummary:
        "A grouping of preparations that wrap or layer a seasoned filling in leaves or vegetables.",
      originSummary: null,
      confidenceLevel: "likely",
      uncertaintyNote:
        "A culinary grouping is not a proven chain of descent. The relationship recorded here is membership, not ancestry.",
      culturalPracticeNote: null,
      role: "cousin",
      roleExplanation:
        "Moussaka layers a filling over vegetable slices rather than wrapping it in leaves, so it is recorded as a cousin dish in this grouping rather than an ancestor or a descendant.",
      changedElements: ["shape", "filling", "cooking_method"],
      sortOrder: 5,
      relatedDishes: [],
    },
  ],
};

// ─── Chongqing hot pot — two attributed accounts ─────────────────────────

const HOTPOT: JourneyFixture = {
  slug: "chongqing-hot-pot",
  status: "history",
  title: "A change of service, and an attributed move between two cities.",
  intro:
    "Two accounts recalled in a modern essay. The dates remain reported historical claims, and the city-to-city connection is schematic.",
  beats: [
    beat({
      sequence: 1,
      title: "Cooking moves from the pot to the table.",
      placeName: "Chongqing — table service",
      dateLabel: "1934 · table service change",
      datePrecision: "exact",
      yearApprox: 1934,
      evidenceKind: "reported_account",
      confidence: "possible",
      placeRole: "preparation_context",
      lat: 29.56,
      lng: 106.55,
      bounds: [105.0, 28.0, 110.0, 32.5],
      regions: ["Chongqing"],
      label:
        "A change from portable divided cooking vessels to table service in Chongqing is recalled. It is not presented as the dish’s invention or the first restaurant.",
      authors: "Lin Wenyu (林文郁)",
      locator: "Chongqing Morning Post, 22 April 2023, p. 006",
      source: {
        id: fid("src"),
        title: "Chongqing food culture historical essay",
        url: "https://epaper.cqcb.com/html/202304/22/content_411703.html",
        citationText:
          "Lin Wenyu. Chongqing food culture historical essay. Chongqing Morning Post, 22 April 2023, p. 006.",
        year: 2023,
        reliability: "secondary",
      },
      scopeNote:
        "The modern essay was inspected; the 1947 Sichuan Times and 1948 Feng Tu Shi Zhi issues were not. The event date, the underlying record dates and the source’s publication date are three different things.",
    }),
    beat({
      sequence: 2,
      title: "The dish is reported in another city.",
      placeName: "Chengdu — reported transmission",
      dateLabel: "1936 · reported transmission",
      datePrecision: "exact",
      yearApprox: 1936,
      evidenceKind: "reported_account",
      confidence: "possible",
      placeRole: "circulation",
      lat: 30.57,
      lng: 104.07,
      bounds: [102.0, 29.0, 106.5, 32.0],
      regions: ["Chengdu", "Chongqing"],
      label:
        "The 1948 account reports a transmission from Chongqing to Chengdu. The connection is a schematic representation of that claim.",
      authors: "Lin Wenyu (林文郁)",
      locator:
        "Chongqing Morning Post, 22 April 2023, p. 006 (reproducing Li Jieren, 1947–48)",
      source: {
        id: fid("src"),
        title: "Chongqing food culture historical essay",
        url: "https://epaper.cqcb.com/html/202304/22/content_411703.html",
        citationText:
          "Lin Wenyu. Chongqing food culture historical essay. Chongqing Morning Post, 22 April 2023, p. 006.",
        year: 2023,
        reliability: "secondary",
      },
      scopeNote:
        "Original periodical issues not inspected. Competing origin and first-establishment accounts exist; the source’s categorical exclusive-origin argument is not adopted.",
    }),
  ],
  movements: [],
  lineages: [],
};

// ─── Century egg & tofu — research gap ──────────────────────────────────

const CENTURY_EGG_TOFU: JourneyFixture = {
  slug: "century-egg-tofu",
  status: "gap",
  title: "No dated chronology of the complete dish has been verified.",
  intro:
    "Preserved-egg history does not date its combination with tofu, and tofu history does not date a preserved egg.",
  beats: [],
  movements: [],
  lineages: [],
  gapNote:
    "No dated chronology for the complete named preparation was verified in this research. This is a research gap: it does not mean the dish is recent, and it does not mean the history is unrecoverable.",
};

// ─── Beyaynetu — research gap ───────────────────────────────────────────

const BEYAYNETU: JourneyFixture = {
  slug: "beyaynetu",
  status: "gap",
  title: "No dated chronology of the complete platter has been verified.",
  intro:
    "Injera, teff and fasting traditions are serving context, not a chronology of this platter.",
  beats: [],
  movements: [],
  lineages: [],
  gapNote:
    "No dated chronology for the complete named platter was verified in this research. No restaurant milestone, American origin or New York national-dish claim is made, and no migration route is drawn. This is a research gap, not a statement of recent invention.",
};

export const JOURNEY_FIXTURES: Record<string, JourneyFixture> = {
  bibimbap: BIBIMBAP,
  "moussaka-greek": MOUSSAKA,
  "chongqing-hot-pot": HOTPOT,
  "century-egg-tofu": CENTURY_EGG_TOFU,
  beyaynetu: BEYAYNETU,
};

export function getJourneyFixture(slug: string): JourneyFixture | null {
  return JOURNEY_FIXTURES[slug] ?? null;
}
