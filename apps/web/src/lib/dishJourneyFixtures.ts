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
import type { JourneyEvidenceBySequence } from "./journeyEvidence";

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
  /**
   * The per-chapter verification record, keyed by the chapter's
   * SEQUENCE ("1", "2", …) — the number the reader sees. What was
   * actually read, and what that does not establish.
   */
  evidence?: JourneyEvidenceBySequence;
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
      dateLabel: "1810 · Hangul name record",
      datePrecision: "exact",
      yearApprox: 1810,
      evidenceKind: "scholarly_interpretation",
      confidence: "documented",
      placeRole: "attestation",
      bounds: [124.0, 33.0, 131.0, 43.5],
      regions: ["Korea"],
      label:
        "The name of bibimbap in Hangeul first appeared in 1810 as “Bubuyum”, in Mongyupyeon, an encyclopedia compiled by Jang Hon. The name was afterwards recorded in several further forms before settling as “bibimbap”. This is a name attestation, not evidence that the dish was invented in that year.",
      authors: "Mun, Eun-Gyung; Lee, Young-Eun; Cha, Youn-Soo",
      locator:
        "Journal of Ethnic Foods 10, 39 (2023), History of bibimbap, paragraph on Mongyupyeon",
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
        "VERIFIED 12 November 2026: the article's own text was read. It states that the Hangeul name first appeared in 1810 as “Bubuyum” in Mongyupyeon, and gives the later variant spellings. The 1810 record is a NAME record, not a recipe record. The same paragraph also points to an earlier recipe-record, Siuijonseo, called only “a cookbook compiled … in the late Joseon Dynasty” with no year given, and to “Hondonban” in Kijaijabki (~1590). Jang Hon's Mongyupyeon itself was not read.",
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
        "Siuijeonseo records a bowl in which the cook mixes everything before serving: rice, prepared meat, seasoned vegetables, sesame salt and plenty of oil, topped with fried t'wigak and slices of fried egg, with fried gochujang set aside to taste. This is the preparation mixed by the cook, unlike the bowl the diner mixes at the table today.",
      authors: "Hwang Hye-seong",
      locator:
        "Encyclopedia of Korean Culture, “Bibimbap”, 내용 (Content) section; bibliography 『한국요리문화사』",
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
        "VERIFIED 12 November 2026: the Korean article was read in a browser (its body is loaded by JavaScript, so it cannot be read with curl). Author: 황혜성 (Hwang Hye-seong), compiled 1995, last revised 7 February 2023. It states that bibimbap first appears in the 1800년대 말 (late 19th century) 『시의전서(是議全書)』, Siuijeonseo, and quotes the mixing method, the fried t'wigak, the fried egg, the sesame salt and oil, the fried gochujang set aside, and 참기름 (sesame oil) added to taste. It cites 『한국요리문화사』 (Lee Seong-u, Kyomunsa, 1985). The DATE IS THE ENCYCLOPEDIA'S: the Mun/Lee/Cha review calls Siuijonseo only “a cookbook compiled … in the late Joseon Dynasty” and gives no year. The Siuijeonseo manuscript itself was NOT read, and the encyclopedia's older “first appearance” claim is not adopted — the 2023 review points to earlier records.",
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
        "The 1921 cookbook Joseon yori jebeop puts radish sprouts and bean sprouts into a pot, heats them, then mixes them with rice and adds seasonings. The rice was stir-fried with the other ingredients before being served — a mixed-over-heat preparation, not the assembled bowl of today.",
      authors: "Academy of Korean Studies",
      locator:
        "The Birth of K-Food: History of 20th Century Korean Food, section 2 (Joseon yori jebeop, 1921)",
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
        "VERIFIED 12 November 2026: the article's own text was read. It says that according to the cookbook Joseon yori jebeop published in 1921, radish sprouts and bean sprouts were placed into a pot, heated, and then mixed with rice, with seasonings added and stirred with chopsticks, and that “the rice was stir-fried with other ingredients before being served”. The 1921 cookbook itself was NOT read. This records a different preparation from the 1929 restaurant account — not one linear development in which every bowl followed a single path.",
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
        "The 1 December 1929 issue of the magazine Byeolgeon’gon describes a bibimbap sold at a restaurant in Jinju, South Gyeongsang: bean sprouts, bracken, mung bean sprouts and cheongpomuk placed on the rice, then finely chopped raw beef and gochujang on top. At the restaurant the customer mixes it at the table.",
      authors: "Academy of Korean Studies",
      locator:
        "The Birth of K-Food: History of 20th Century Korean Food, section 2 (Byeolgeon’gon, 1 December 1929)",
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
        "VERIFIED 12 November 2026: the article's own text was read. It says that the December 1 1929 issue of Byeolgeon’gon describes a bibimbap sold at a restaurant in Jinju, South Gyeongsang province, with bean sprouts, bracken, mung bean sprouts and yellow mung bean jelly (cheongpomuk) placed on the rice, followed by finely chopped raw beef (yukhoe) and a dollop of gochujang, and that at the restaurant the ingredients are placed on top and the customer mixes. The 1929 periodical itself was NOT read. Jinju is recorded here as a place a preparation was documented — NOT as an invention site.",
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
        "Jeonju bibimbap, already appearing in the press from the 1960s, became a nationwide food from the early 1980s as branch restaurants of provincial cuisines opened in Seoul. The study treats this as the making of a Jeonju-origin narrative, and records the competing accounts — a harvest-season food of the Jeonju farming region, and a dish said to have been developed for speed by Donghak army troops — as influential discourses rather than as a settled origin.",
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
        "VERIFIED 12 November 2026: the article's Korean and English ABSTRACTS were read (the full article is paywalled — ₩8,500). Citation confirmed: Joo Young-ha, “비빔밥”의 진화와 담론 연구, 사회와 역사 87 (2010.09), pp. 5–38, 34 pages. The abstract states that Jeonju bibimbap, appearing in the press since the 1960s, “1980년대 초반부터 전국적인 음식으로 자리를 잡았다” — took its place as a nationwide food from the early 1980s — and that urbanization from the 1970s drove the discourse. The abstract also describes the shift from cook-mixed to eater-mixed. The Jeonju–Seoul connection is an attributed schematic circulation, not a reconstructed route. THE FULL ARTICLE WAS NOT READ.",
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
        "From the late 1990s, Jeonju bibimbap spread abroad, including to Japan, and the claim that it had been a royal dish was taken up more actively. The study reads this circulation as part of the making of a Jeonju-origin narrative.",
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
        "VERIFIED 12 November 2026: from the Korean abstract — “1990년대 말부터 전주비빔밥이 일본을 비롯하여 해외로 진출” — from the late 1990s Jeonju bibimbap went abroad including to Japan. This is a country-level reception claim at a broad period, NOT a first-arrival date and NOT a reconstruction of any route. The full article was not read.",
    }),
  ],
  movements: [],
  lineages: [],
  evidence: {
    // Chapter 1 — the 1810 Hangul name record.
    "1": {
      level: "full_text_inspected",
      materialInspected:
        "The complete article text: the History of bibimbap section, the Mongyupyeon paragraph, and the reference list.",
      limits:
        "Jang Hon's Mongyupyeon itself was NOT read. The article points to Siuijonseo — calling it only “a cookbook compiled … in the late Joseon Dynasty” and giving NO year for it — so it cannot be used to date that manuscript.",
      corrections: [
        "The pack called this “a Hangul form of bibimbap's name”; the article says the Hangeul name first appeared as “Bubuyum”, and lists the later variant spellings.",
        "The pack treated 1810 as a “historical name record”; it is a NAME record, and the review records an earlier recipe-record and an earlier attestation, so 1810 is not a beginning.",
      ],
    },
    // Chapter 2 — the Siuijeonseo recipe record.
    "2": {
      level: "full_text_inspected",
      materialInspected:
        "The whole Korean article: the definition, the content section with the Siuijeonseo passage, and the bibliography.",
      limits:
        "Siuijeonseo was NOT read — the encyclopedia quotes it. The date “1800년대 말” is the ENCYCLOPEDIA'S; the 2023 review gives no year for the same manuscript, so the date must not be attributed to the review.",
      corrections: [
        "The pack's ingredient list was checked against the article: rice, prepared meat, seasoned vegetables, sesame salt and plenty of oil, fried t'wigak, sliced fried egg, fried gochujang set aside, and sesame oil added to taste.",
        "The pack attributed the late-19th-century date to the 2023 review; it belongs to the Encyclopedia.",
        "The pack omitted that the encyclopedia's own “first appearance” claim is not adopted, because the 2023 review points to earlier records.",
      ],
    },
    // Chapter 3 — the 1921 cookbook preparation.
    "3": {
      level: "full_text_inspected",
      materialInspected:
        "The whole Birth of K-Food section 2, including the 1921 cookbook passage and the 1929 magazine passage.",
      limits:
        "The 1921 cookbook Joseon yori jebeop was NOT read. The account describes ONE recorded preparation, not the way every household made the dish.",
      corrections: [
        "The pack said “vegetables are heated in a pot and then stirred with rice”; the text is more specific — radish sprouts and bean sprouts into a pot, heated, then mixed with rice and seasonings, and “the rice was stir-fried with other ingredients before being served”.",
      ],
    },
    // Chapter 4 — the 1929 restaurant account.
    "4": {
      level: "full_text_inspected",
      materialInspected:
        "The whole Birth of K-Food section 2, including the 1 December 1929 Byeolgeon'gon paragraph in full.",
      limits:
        "The 1 December 1929 issue of Byeolgeon'gon was NOT read. The account is of a RESTAURANT serving, which is one setting, not the general way the dish was prepared.",
      corrections: [
        "The pack said “a topping arrangement with raw beef and gochujang”; the text lists bean sprouts, bracken, mung bean sprouts and cheongpomuk on the rice, then finely chopped raw beef and gochujang, and says the customer mixes it.",
      ],
    },
    // Chapter 5 — Jeonju and Seoul. The ABSTRACT only.
    "5": {
      level: "abstract_only",
      materialInspected:
        "The Korean and English ABSTRACTS, and the article's metadata (Society and History 87, 2010.09, pp. 5–38, 34 pages).",
      limits:
        "The FULL ARTICLE was not accessed — it is paywalled. The abstract supports what it states and nothing more: the early-1980s national recognition and the late-1990s spread to Japan. It does not support any claim beyond that about the competing origin accounts.",
      corrections: [
        "The pack's “Jeonju style's national recognition in the early 1980s” is the abstract's “1980년대 초반부터 전국적인 음식으로 자리를 잡았다”. The pack also omitted that the paper attributes the spread to urbanization from the 1970s and treats the competing accounts as influential DISCURSES rather than settled origin.",
        "The pack did not say the article was an abstract. It was.",
      ],
    },
    // Chapter 6 — Japan. The same abstract.
    "6": {
      level: "abstract_only",
      materialInspected:
        "The Korean and English ABSTRACTS of the same article.",
      limits:
        "The FULL ARTICLE was not accessed. The abstract supports the late-1990s spread to Japan and the rise of the royal-dish claim; it does not support a first-arrival date, a route, or anything about the mechanism of the spread.",
      corrections: [
        "The pack's “overseas circulation, including adoption in Japan in the late 1990s” is the abstract's “1990년대 말부터 전주비빔밥이 일본을 뿐만 아니라 해외로 진출”, and the spread was read as part of constructing a Jeonju-origin narrative.",
      ],
    },
  },
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
        "Recipe 106, “Muzakka”: a leg of mutton or lamb is minced very fine and fried with onions, butter and salt, stirred with parsley, then laid with sliced egg-plants in layers into a pan, covered with a pint of broth, and simmered until the liquor is nearly absorbed. No béchamel appears.",
      authors: "Turabi Efendi",
      locator: "Turkish Cookery Book (1864), receipt No. 106, printed p. 36",
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
        "VERIFIED 12 November 2026 — THIS IS A PRIMARY RECORD, READ DIRECTLY. The Internet Archive item b21527830 (University of Leeds Library copy) gives the edition as London, 1864, and the book's own index reads: “Muzakka — Minced mutton, done with egg-plants … 106”. The full OCR of receipt No. 106 was read: minced mutton or lamb, two or three finely chopped onions, two or three ounces of fresh butter, parsley, three or four egg-plants in salt water, the meat and egg-plants laid “in layers into a pan”, a pint of broth (No. 1), covered and simmered. The printed page is 36. CHECKED AND ABSENT from the recipe: béchamel, white sauce, flour, milk. The title's 1862 banquet context is NOT the 1864 edition date, and London publication is NOT London origin.",
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
        "An interpretation of the dish’s early development in Greece discusses Tselementes’ cookbook and the familiar béchamel-topped form. (Reported through a secondary summary — the original article could not be read.)",
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
        "NOT VERIFIED — ACCESS BLOCKED. The Neos Kosmos article returned HTTP 403 to every attempt on 12 November 2026, so the author's own words were NOT read. What is recorded here comes from the reference pack's summary of that article and is therefore a REPORTED claim, not an inspected one. The 2011 article is also a republication: it was first published in The Atlantic. The cookbook it discusses (Tselementes') was NOT read either. No exact invention year, exclusive inventor, or direct route from recipe 106 is claimed. THIS CHAPTER SHOULD NOT BE PUBLISHED until the article is read.",
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
        "VERIFIED 12 November 2026: the Brighton and Hove Museums account was read and names Elizabeth David, A Book of Mediterranean Food, and moussaka among its recipes, with the year 1950. The BOOK ITSELF WAS NOT READ — only the museum's account of it. This is historical readership and reception — NOT British origin and NOT first arrival.",
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
  evidence: {
    // Chapter 1 — the 1864 recipe. THE PRIMARY RECORD.
    "1": {
      level: "primary_inspected",
      materialInspected:
        "The original book: the Internet Archive item's edition metadata, the book's own index, and the full OCR of receipt No. 106 with its ingredient and method lines.",
      limits:
        "This is ONE recipe in ONE 1864 London edition. It is a MOCKAKKA, not necessarily the ancestor of the modern Greek moussaka; the link is an editorial interpretation, and the absence of béchamel here does not mean béchamel was unknown.",
      corrections: [
        "The pack's ingredient summary was checked against the recipe: a leg of mutton or lamb minced very fine, two or three chopped onions, two or three ounces of fresh butter, salt, parsley, three or four egg-plants in salt water, the meat and egg-plants laid “in layers into a pan”, a pint of broth, covered and simmered until the liquor is nearly absorbed.",
        "The pack's “simmers them in broth” is right but incomplete — the layering and the parsley are part of the record.",
        "The pack's “no béchamel appears” was verified by searching the recipe for béchamel, white sauce, flour and milk: all absent.",
      ],
    },
    // Chapter 2 — Kremezi. NOT REACHED.
    "2": {
      level: "inaccessible",
      materialInspected:
        "Nothing. The article returned HTTP 403 on every attempt on 12 November 2026.",
      limits:
        "The claim is UNRESOLVED. It is known only through the reference pack's summary of the article, which is itself a secondary account. The 2011 piece is also a republication of an Atlantic article, so the original may be the better source.",
      unresolved: true,
      corrections: [
        "The pack recorded this as “reported through a secondary summary” without saying the source was unreachable. It is unreachable.",
      ],
    },
    // Chapter 3 — Elizabeth David. The museum account, not the book.
    "3": {
      level: "full_text_inspected",
      materialInspected:
        "The whole Brighton & Hove Museums account, which names Elizabeth David, A Book of Mediterranean Food, and moussaka among its recipes, with the year 1950.",
      limits:
        "The BOOK ITSELF was not read — only the museum's account of it. That is readership and reception in British cooking, not origin and not first arrival.",
      corrections: [
        "The pack said “described by Brighton & Hove Museums”; the account names the book, the author and the year, which is stronger than the pack's summary.",
      ],
    },
  },
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
        "NOT VERIFIED — ACCESS UNAVAILABLE. The Chongqing Morning Post page (epaper.cqcb.com) did not return readable content on 12 November 2026, and neither the 1947 Sichuan Times nor the 1948 Feng Tu Shi Zhi could be consulted. What is recorded here comes from the reference pack's summary of Lin Wenyu's 2023 essay and is therefore REPORTED, not inspected. The event date (1934), the underlying record dates (1947-48) and the source's publication date (2023) are three different things and must not be merged.",
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
        "NOT VERIFIED — ACCESS UNAVAILABLE. The 2023 essay could not be read, and neither the 1947 Sichuan Times nor the 1948 Feng Tu Shi Zhi could be consulted. The 1936 transmission is REPORTED, not inspected. Competing origin and first-establishment accounts exist; the source's categorical exclusive-origin argument is not adopted. THIS CHAPTER SHOULD NOT BE PUBLISHED until a primary record is read.",
    }),
  ],
  movements: [],
  lineages: [],
  evidence: {
    // Chapter 1 — the 1934 table-service change.
    "1": {
      level: "inaccessible",
      materialInspected:
        "Nothing. The Chongqing Morning Post page did not return readable content on 12 November 2026, and neither the 1947 Sichuan Times nor the 1948 Feng Tu Shi Zhi could be consulted.",
      limits:
        "The claim is UNRESOLVED. It is known only through the reference pack's summary of Lin Wenyu's 2023 essay, which is itself a secondary account. The event date (1934), the underlying record dates (1947–48) and the source's publication date (2023) are three different things and must not be merged.",
      unresolved: true,
      corrections: [
        "The pack recorded this as “the modern essay was inspected; the 1947 Sichuan Times and 1948 Feng Tu Shi Zhi issues were not”. The modern essay could not be read either — so the level is “source not reached”, not “full text read”.",
      ],
    },
    // Chapter 2 — the 1936 Chongqing → Chengdu transmission.
    "2": {
      level: "inaccessible",
      materialInspected: "Nothing, for the same reason as chapter 1.",
      limits:
        "The claim is UNRESOLVED, and it is the more consequential of the two: a claimed movement between two cities is exactly the kind of claim that must not be drawn on a map while it rests on an unread source.",
      unresolved: true,
      corrections: [
        "The pack recorded this as “original periodical issues not inspected”, which reads as if the modern essay had been read. It had not.",
      ],
    },
  },
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
