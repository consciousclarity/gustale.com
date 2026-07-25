import type { SeedLineage } from "./types.js";

// =====================================================================
// LINEAGE PREPARATION METHODS — the "family" axis of the encyclopedia.
// =====================================================================
//
// Every published dish is assigned exactly ONE primary preparation method
// (its "lineage"). The slugs here MUST stay 1:1 with the LINEAGE_LABELS map
// in apps/web/src/pages/lineages.astro — that page groups dishes by the
// dish's first preparation method (methodSlug) to render lineage cards.
//
// The seeder (seed.ts) inserts these into `preparation_methods` and then
// writes one `dish_preparations` row per dish using DISH_LINEAGES below.

export const LINEAGE_METHODS: Array<{
  slug: string;
  name: string;
  category: string;
}> = [
  {
    slug: "poached-in-sauce",
    name: "Poached in sauce",
    category: "moist-heat",
  },
  {
    slug: "omelettes-and-scrambles",
    name: "Omelettes & scrambles",
    category: "dry-heat",
  },
  { slug: "fried-and-topped", name: "Fried & topped", category: "dry-heat" },
  {
    slug: "steamed-and-custard",
    name: "Steamed & custard",
    category: "moist-heat",
  },
  { slug: "boiled-and-cured", name: "Boiled & cured", category: "moist-heat" },
  { slug: "pasta", name: "Pasta", category: "moist-heat" },
  { slug: "noodle-soup", name: "Noodle soup", category: "moist-heat" },
  { slug: "stew", name: "Stew & braise", category: "moist-heat" },
  { slug: "fried-rice", name: "Rice bowl", category: "dry-heat" },
  { slug: "dumpling", name: "Dumpling", category: "moist-heat" },
  { slug: "bread", name: "Bread & dough", category: "dry-heat" },
  { slug: "pancake", name: "Flatbread", category: "dry-heat" },
  { slug: "dessert", name: "Sweets & custard", category: "dry-heat" },
  { slug: "curry", name: "Curry", category: "moist-heat" },
  { slug: "kebab", name: "Grilled & skewered", category: "dry-heat" },
  { slug: "salad", name: "Small plates & preserves", category: "raw" },
];

// dish slug → lineage method slug (one of LINEAGE_METHODS above).
// Distribution: stew 11 · rice 9 · small-plates 7 · noodle-soup 7 · dumpling 4
// · bread/fried-topped/kebab/curry 3 each · dessert/boiled-cured/poached 2 each
// · pasta/pancake/omelette/steamed 1 each. No dish falls back to "other".
export const DISH_LINEAGES: Record<string, string> = {
  "moussaka-greek": "fried-and-topped",
  "moussaka-levant": "fried-and-topped",
  "musakka-turkish": "fried-and-topped",
  "cacio-e-pepe": "pasta",
  "pizza-margherita": "bread",
  "paella-valenciana": "fried-rice",
  gazpacho: "salad",
  "tarte-tatin": "dessert",
  "boeuf-bourguignon": "stew",
  "wiener-schnitzel": "fried-and-topped",
  pierogi: "dumpling",
  "goulash-hungarian": "stew",
  "ramen-japanese": "noodle-soup",
  sushi: "boiled-and-cured",
  "pad-thai": "noodle-soup",
  "tom-yum": "stew",
  "pho-vietnamese": "noodle-soup",
  "banh-mi": "bread",
  "hainanese-chicken-rice": "fried-rice",
  "nasi-goreng": "fried-rice",
  bibimbap: "fried-rice",
  "kimchi-jjigae": "stew",
  hummus: "salad",
  falafel: "salad",
  shawarma: "kebab",
  "biryani-hyderabadi": "fried-rice",
  "chicken-tikka-masala": "curry",
  feijoada: "stew",
  "ceviche-peruvian": "boiled-and-cured",
  "hamburger-american": "bread",
  poutine: "fried-and-topped",
  "tagine-moroccan": "stew",
  "jollof-rice": "fried-rice",
  "babi-guling": "kebab",
  rendang: "curry",
  "soto-ayam": "stew",
  rawon: "stew",
  "gado-gado": "salad",
  pempek: "salad",
  "nasi-campur-bali": "fried-rice",
  "sate-lilit": "kebab",
  laksa: "noodle-soup",
  "khao-soi": "noodle-soup",
  udon: "noodle-soup",
  "mapo-tofu": "poached-in-sauce",
  congee: "fried-rice",
  "baba-ganoush": "salad",
  shakshuka: "poached-in-sauce",
  "tacos-al-pastor": "kebab",
  "tamales-mexican": "steamed-and-custard",
  "dim-sum": "steamed-and-custard",
  "pho-bo": "noodle-soup",
  "ramen-tonkotsu": "noodle-soup",
  tonkatsu: "fried-and-topped",
  okonomiyaki: "fried-and-topped",
  "croque-monsieur": "fried-and-topped",
  omelette: "omelettes-and-scrambles",
  khachapuri: "bread",
  bigos: "stew",
  acaraje: "fried-and-topped",
  "bacalhau-a-bras": "fried-and-topped",
  borscht: "stew",
  couscous: "steamed-and-custard",
  dosa: "fried-and-topped",
  empanada: "fried-and-topped",
  japchae: "fried-rice",
  jiaozi: "steamed-and-custard",
  mansaf: "stew",
  momo: "steamed-and-custard",
  "risotto-alla-milanese": "fried-and-topped",
  tamales: "steamed-and-custard",
  tiramisu: "dessert",
  tostones: "fried-and-topped",
  vindaloo: "stew",
  kofta: "kebab",
  kibbeh: "fried-and-topped",
  tabbouleh: "salad",
  fattoush: "salad",
  dolma: "stew",
  menemen: "poached-in-sauce",
  "doner-kebab": "kebab",
  pide: "bread",
  manti: "dumpling",
  "iskender-kebab": "kebab",
  samosa: "fried-and-topped",
  idli: "steamed-and-custard",
  vada: "fried-and-topped",
  "chole-bhature": "curry",
  "butter-chicken": "curry",
  "aloo-gobi": "curry",
  "masala-dosa": "pancake",
  "palak-paneer": "curry",
  soba: "noodle-soup",
  yakitori: "kebab",
  tempura: "fried-and-topped",
  takoyaki: "fried-and-topped",
  gyoza: "dumpling",
  "peking-duck": "fried-and-topped",
  "kung-pao-chicken": "fried-and-topped",
  xiaolongbao: "steamed-and-custard",
  "chow-mein": "fried-rice",
  "dan-dan-noodles": "noodle-soup",
  "char-siu": "fried-and-topped",
  "mole-poblano": "curry",
  "chiles-en-nogada": "stew",
  arepa: "pancake",
  "bandeja-paisa": "fried-rice",
  "lomo-saltado": "fried-rice",
  anticuchos: "kebab",
  "arroz-con-pollo": "fried-rice",
  choripan: "bread",
  asado: "kebab",
  humita: "steamed-and-custard",
  lechon: "kebab",
  "adobo-filipino": "stew",
  sinigang: "stew",
  "kare-kare": "stew",
  "halo-halo": "dessert",
  satay: "kebab",
  "ikan-bakar": "kebab",
  sambal: "salad",
  martabak: "pancake",
  bakso: "noodle-soup",
  "bubur-ayam": "fried-rice",
  "nasi-padang": "fried-rice",
  injera: "bread",
  "doro-wat": "stew",
  bulgur: "fried-rice",
  focaccia: "bread",
};

// =====================================================================
// LINEAGES — the migration/transformation/influence axis
// =====================================================================
//
// Each entry is a curated story about how a dish *idea* moves across
// regions, generations, and cultures. Lineages are deliberately distinct
// from families (which classify by form: dumpling, flatbread, stew) and
// from cuisines (which classify by region: Italian, Thai, Levantine).
//
// IMPORTANT editorial rules followed here:
//   - We do NOT claim all members descend from one origin unless the
//     evidence supports it. Where the link is plausible but not proven,
//     we say so: "likely related", "possible influence", "parallel
//     evolution", "same technique, unclear historical link".
//   - We preserve local names. We do NOT flatten samosa, empanada,
//     jiaozi, pierogi into "dumpling" without also naming each.
//   - Confidence is encoded per lineage AND per dish-lineage edge.
//   - `representativeDishes` are illustrative — they are NOT necessarily
//     present in the current Gustale dataset. The card UI will note when
//     a lineage has zero or few mapped dishes yet, so we don't pretend.
//
// `dishMappings` is keyed by Gustale dish slug (must match an entry in
// DISHES above). Each mapping carries an editorial role, an explanation,
// the changedElements it embodies, a confidence level, and a sort weight.
export const LINEAGES: SeedLineage[] = [
  // ─── 1. Filled dough / dumpling lineage ─────────────────────────────
  {
    slug: "filled-dough",
    name: "Filled Dough Across Eurasia",
    shortDescription:
      "Dough wrapped around a filling, then steamed, boiled, baked, or fried — the most traveled food shape on earth.",
    longDescription:
      "Filled dough is one of the clearest examples of parallel invention meeting historical transmission. The basic idea — wrap a filling in a thin dough, cook it — appears independently across at least four macro-regions (East Asia, Central Asia, the Mediterranean, Eastern Europe), and once those traditions met along the Silk Road and the Mongol expansion, they cross-pollinated for centuries. The result is a chain of related forms: jiaozi, momo, manti, pierogi, ravioli, empanada, samosa, and more.",
    conceptSummary:
      "A portable, hand-shaped meal: a wrapper of grain flour, a savory or sweet interior, and a fast cooking method. The lineage is a network of cousins, not a single family tree.",
    originSummary:
      "No single origin. Wheat-based filled dough appears in Mediterranean antiquity (Roman lagana, later ravioli); wheat- and millet-based filled dough appears independently in northern China by the Han dynasty. The shape spread along trade and conquest routes, then absorbed local fillings.",
    originRegions: [
      "East Asia",
      "Central Asia",
      "Mediterranean basin",
      "Northern China",
    ],
    relatedRegions: [
      "Eastern Europe",
      "South Asia",
      "Central Asia",
      "Italy",
      "Mongolia",
      "Tibet",
      "Nepal",
    ],
    historicalForces: [
      "trade_route",
      "empire",
      "parallel_evolution",
      "cultural_exchange",
    ],
    primaryTechnique: "filling-and-sealing",
    techniques: ["steaming", "boiling", "pan-frying", "deep-frying", "baking"],
    baseIngredients: [
      "wheat flour",
      "rice flour",
      "minced meat",
      "vegetables",
      "cheese",
      "legumes",
    ],
    courseGroups: ["main-course", "appetizer", "street-snack"],
    relatedFamilies: ["dumpling", "pasta", "pancake"],
    representativeDishes: [
      "Jiaozi",
      "Momo",
      "Manti",
      "Mantı",
      "Pelmeni",
      "Pierogi",
      "Ravioli",
      "Tortellini",
      "Gyoza",
      "Mandu",
      "Empanada",
      "Samosa",
      "Khinkali",
      "Pasty",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "The relationship between Central Asian manti and East Asian jiaozi is well documented through Silk Road transmission. The relationship between those and Italian ravioli is more debated — direct transmission vs. shared Mediterranean + Levantine roots is unresolved.",
    culturalPracticeNote:
      "Filled dough is overwhelmingly festive food: Lunar New Year jiaozi in northern China, Tibetan Losar momo, Christmas pierogi in Poland, Ramadan manti in some Central Asian households. The act of folding is often communal.",
    sourceNotes:
      "Wikipedia: Jiaozi, Momo (dumpling), Pierogi, Ravioli; Encyclopedia of Food and Health (2016); Darra Goldstein, A Fork in the Road (2014).",
    displayOrder: 10,
    dishMappings: [
      {
        dishSlug: "jiaozi",
        role: "ancestor",
        explanation:
          "Wheat-flour wrapper folded around pork or vegetable filling, then boiled or pan-fried. The Han-dynasty reference (c. 200 CE) is one of the earliest documented filled doughs in East Asia.",
        changedElements: ["dough", "filling", "shape", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "momo",
        role: "cousin",
        explanation:
          "Thin wheat wrapper, finely ground meat or vegetable filling, steamed. Likely transmitted from Chinese jiaozi along Himalayan trade routes, then adapted to local ingredients (yak, buffalo, Tibetan herbs). The 'likely related' link to jiaozi is widely accepted; the specifics of transmission are debated.",
        changedElements: ["filling", "shape", "wrapper", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 9,
      },
      {
        dishSlug: "pierogi",
        role: "cousin",
        explanation:
          "Wheat-flour wrapper folded over a savory filling (potato, cheese, sauerkraut, mushroom, meat), then boiled and often pan-fried with onions. Eastern European adaptation with influences from Italian and Ottoman cuisine — direct line is debated.",
        changedElements: ["filling", "cooking_fat", "serving_context"],
        confidenceLevel: "possible",
        sortOrder: 7,
      },
      {
        dishSlug: "empanada",
        role: "cousin",
        explanation:
          "Wheat or corn dough folded around a meat or vegetable filling, then baked or fried. Iberian in origin (likely from the Arabic influence on medieval Spain), then carried to the Americas. Shares the 'folded filled dough' idea with Eurasian dumplings but the historical connection is indirect.",
        changedElements: ["dough", "cooking_method", "filling"],
        confidenceLevel: "possible",
        sortOrder: 6,
      },
      {
        dishSlug: "dim-sum",
        role: "technique_relative",
        explanation:
          "Cantonese tradition of small filled dough parcels — steamed dumplings, buns, rolls — served as part of yum cha. Shares the filled-dough idea with jiaozi but emerged as a distinct tea-house tradition in southern China.",
        changedElements: ["serving_context", "shape", "wrapper"],
        confidenceLevel: "likely",
        sortOrder: 5,
      },
    ],
  },

  // ─── 2. Flatbread lineage ───────────────────────────────────────────
  {
    slug: "flatbread",
    name: "Flatbread",
    shortDescription:
      "Unleavened or lightly leavened grain flatbread, baked on a griddle, in a clay oven, or stuck to the wall of a tandoor — the oldest bread idea on earth.",
    longDescription:
      "Flatbread predates leavened bread in nearly every grain civilization. The form is shaped by three forces: the local grain (wheat, millet, teff, maize, rice flour), the cooking technology (griddle, tandoor, saj, comal, clay oven), and the meal context (daily staple, festival bread, wrap for kebab). Flatbreads spread along trade routes and through empire — naan and lavash moved with Persian and Ottoman influence, tortilla with maize agriculture, arepa with pre-Columbian South American systems, injera with Ethiopian teff cultivation.",
    conceptSummary:
      "Grain flour + water + heat = a flat cooked bread. The shape of the bread is a record of the grain, the oven, and the meal that surrounds it.",
    originSummary:
      "No single origin. Flatbread is the default bread form whenever grain cultivation begins: Neolithic Middle East for wheat and barley, the Ethiopian highlands for teff, Mesoamerica for maize, the Indian subcontinent for millet flatbreads.",
    originRegions: [
      "Fertile Crescent",
      "Ethiopian Highlands",
      "Mesoamerica",
      "South Asia",
    ],
    relatedRegions: [
      "North Africa",
      "Andean region",
      "Levant",
      "Iranian Plateau",
      "Italy",
      "Mexico",
    ],
    historicalForces: [
      "agricultural_spread",
      "empire",
      "trade_route",
      "parallel_evolution",
    ],
    primaryTechnique: "griddle-or-oven-baking",
    techniques: [
      "griddle-baking",
      "tandoor-baking",
      "clay-oven-baking",
      "pan-frying",
    ],
    baseIngredients: [
      "wheat flour",
      "maize flour",
      "teff flour",
      "millet flour",
      "rice flour",
      "water",
      "salt",
      "yeast",
    ],
    courseGroups: ["side", "main-course", "appetizer", "bread"],
    relatedFamilies: ["bread", "pancake"],
    representativeDishes: [
      "Naan",
      "Pita",
      "Lavash",
      "Roti",
      "Chapati",
      "Tortilla",
      "Arepa",
      "Injera",
      "Focaccia",
      "Manakish",
      "Yufka",
      "Markook",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "Each flatbread tradition has its own grain and oven, and 'shared ancestor' claims across continents are weaker than within a continent. The wheat flatbreads of West Asia form a coherent family; the maize flatbreads of the Americas form another.",
    culturalPracticeNote:
      "Flatbread is the daily bread of roughly half the world's population. Breaking bread together is a near-universal ritual; in Ethiopia, gursha (feeding a friend by hand from one's own injera) is a sign of deep affection.",
    sourceNotes:
      "Wikipedia: Flatbread, Naan, Injera, Tortilla; H. G. Manniche, Sacred Luxuries (1999); Rachel Laudan, Cuisine and Empire (2013).",
    displayOrder: 20,
    dishMappings: [
      {
        dishSlug: "pizza-margherita",
        role: "descendant",
        explanation:
          "Italian flatbread topped with tomato, cheese, and oil. The flatbread lineage is ancient; pizza-as-topped-flatbread emerged in Naples in the 18th–19th century after tomato arrived from the Americas.",
        changedElements: ["filling", "cooking_method", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "khachapuri",
        role: "cousin",
        explanation:
          "Georgian filled flatbread, traditionally stuffed with cheese and egg. A regional variant of the broader Levantine-and-Caucasian flatbread tradition, enriched with local dairy.",
        changedElements: ["filling", "shape", "cooking_method"],
        confidenceLevel: "likely",
        sortOrder: 7,
      },
      {
        dishSlug: "banh-mi",
        role: "fusion",
        explanation:
          "Vietnamese baguette sandwich. The baguette itself is a French colonial import; the sandwich is a fusion of French bread with Vietnamese fillings (pâté, pickled vegetables, cilantro, chili). A clear case of colonial-era transmission.",
        changedElements: ["filling", "serving_context", "shape"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
    ],
  },

  // ─── 3. Rice pilaf / layered rice lineage ───────────────────────────
  {
    slug: "rice-pilaf",
    name: "Rice as Carrier",
    shortDescription:
      "Rice cooked in fat with aromatics, then steamed with broth, spices, meat, or seafood — a lineage shaped by Mughal, Persian, Mediterranean, and West African traditions.",
    longDescription:
      "The 'rice as carrier' idea — toasting the grains in fat with onions and spices, then simmering in broth until tender — appears independently across at least three regions: Persian polow, Mughal biryani, and Mediterranean paella. These are not all descendants of one ancestor: rice agriculture itself spread from Asia to the Mediterranean via multiple routes, and each region developed its own technique. The result is a network of related but distinct traditions.",
    conceptSummary:
      "Rice cooked with a flavorful fat and aromatic base, with regional spice and protein choices layered in.",
    originSummary:
      "Rice domestication is in the Yangtze valley (c. 8000 BCE). Pilaf/polo techniques developed in Persian-influenced Central Asia and spread westward through Mughal India, Ottoman Turkey, and into the Mediterranean. West African jollof evolved separately through rice cultivation in the Niger basin.",
    originRegions: ["Persia", "Mughal India", "Mediterranean", "West Africa"],
    relatedRegions: [
      "Spain",
      "Iranian Plateau",
      "Indian subcontinent",
      "Indonesia",
      "Mali",
      "Senegal",
      "Italy",
    ],
    historicalForces: [
      "agricultural_spread",
      "empire",
      "trade_route",
      "parallel_evolution",
    ],
    primaryTechnique: "toasted-rice-then-steamed",
    techniques: [
      "pilaf method",
      "dum cooking",
      "absorbption method",
      "risotto method",
    ],
    baseIngredients: [
      "rice",
      "onion",
      "oil or ghee",
      "broth",
      "saffron",
      "spices",
      "meat",
      "seafood",
    ],
    courseGroups: ["main-course"],
    relatedFamilies: ["rice-dish", "fried-rice", "stew"],
    representativeDishes: [
      "Pilaf",
      "Plov",
      "Biryani",
      "Kabsa",
      "Paella",
      "Risotto",
      "Nasi Goreng",
      "Jollof Rice",
      "Arroz con Pollo",
      "Mandi",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "The link between Persian polo and Indian biryani is well documented via Mughal expansion. The link between Persian polo and West African jollof is much weaker — both use rice-as-carrier but developed independently. Spanish paella is a Mediterranean cousin, not a descendant of Persian pilaf.",
    culturalPracticeNote:
      "Biryani is a festive dish across South Asia, often served at weddings and Eid. Paella is cooked communally over an open fire in Valencia. Jollof rice is a point of friendly rivalry between Ghana, Nigeria, Senegal, and Cameroon — each claims the best version.",
    sourceNotes:
      "Wikipedia: Pilaf, Biryani, Paella, Jollof rice; Claudia Roden, A Book of Middle Eastern Food (1968); Madhur Jaffrey, A Taste of India (1985).",
    displayOrder: 30,
    dishMappings: [
      {
        dishSlug: "paella-valenciana",
        role: "regional_variant",
        explanation:
          "Valencia's rice-as-carrier: short-grain bomba rice, saffron, olive oil, seafood or rabbit, cooked uncovered over an open fire. Shares the 'toasted rice + broth' technique with Persian polo but evolved independently in Spain.",
        changedElements: ["spice_profile", "cooking_fat", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 9,
      },
      {
        dishSlug: "biryani-hyderabadi",
        role: "regional_variant",
        explanation:
          "Hyderabadi biryani: basmati rice layered with marinated meat, fried onions, saffron, and aromatics, then slow-cooked sealed (dum). A clear descendant of Persian pilaf via Mughal influence, adapted with local spice profiles.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "jollof-rice",
        role: "parallel_evolution",
        explanation:
          "West African rice cooked in a tomato-pepper base with onions, scotch bonnets, and thyme. The tomato-pepper base is post-Columbian; the rice-cooking technique has local roots. The relationship to pilaf is 'same logic, different ingredients, different history.'",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 7,
      },
      {
        dishSlug: "nasi-goreng",
        role: "cousin",
        explanation:
          "Indonesian fried rice: leftover rice stir-fried with kecap manis, garlic, shallots, and toppings. Carries Indian and Chinese rice-cooking influence via trade; uses local sweet soy and sambal.",
        changedElements: ["cooking_method", "spice_profile", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 6,
      },
      {
        dishSlug: "risotto-alla-milanese",
        role: "cousin",
        explanation:
          "Italian rice cooked by gradually adding hot broth, with saffron and beef-bone-marrow fat. Shares 'rice cooked in flavorful liquid' with pilaf but uses a different technique (stirred addition vs. absorption).",
        changedElements: ["cooking_method", "cooking_fat", "spice_profile"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 6,
      },
      {
        dishSlug: "bibimbap",
        role: "cousin",
        explanation:
          "Korean rice bowl with seasoned vegetables, meat, egg, and gochujang. A 'rice-as-base' dish with local toppings; the technique is closer to fried rice than to pilaf but shares the carrier-grain idea.",
        changedElements: ["serving_context", "spice_profile", "cooking_method"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 4,
      },
    ],
  },

  // ─── 4. Noodle soup lineage ─────────────────────────────────────────
  {
    slug: "noodle-soup",
    name: "Noodle Soup Across Asia and Beyond",
    shortDescription:
      "Wheat or rice noodles served in broth, transformed by stock base, spice paste, toppings, and migration — one of the most traveled broth-and-noodle traditions.",
    longDescription:
      "Noodle soup is the convergence of two ideas: noodle-making (which spread along the Silk Road and via Arab trade) and broth-based soup (which is universal). Each region then layered its own logic: dashi in Japan, beef broth in Vietnam, coconut and spice paste in Malaysia, beef bone and marrow in China. Colonial migration carried these forms to new countries and created fusion traditions like Vietnamese phở in diaspora or Laksa in port cities.",
    conceptSummary:
      "Noodles + broth + toppings, with the broth being the most culturally specific part.",
    originSummary:
      "Noodles likely originated in northern China during the Han dynasty (c. 200 BCE). Wheat noodles spread west through the Silk Road; rice noodles developed in southern China and Southeast Asia. Each region built its own broth tradition on top of the imported noodle.",
    originRegions: ["Northern China", "Southeast Asia", "Mediterranean"],
    relatedRegions: [
      "Japan",
      "Korea",
      "Vietnam",
      "Thailand",
      "Malaysia",
      "Indonesia",
      "Italy",
    ],
    historicalForces: [
      "trade_route",
      "colonial_spread",
      "diaspora",
      "local_adaptation",
    ],
    primaryTechnique: "broth-cooked-noodles",
    techniques: [
      "broth simmering",
      "wok hei (breath of the wok)",
      "topping arrangement",
      "noodle pulling",
    ],
    baseIngredients: [
      "wheat noodles",
      "rice noodles",
      "broth (meat, fish, or bone)",
      "aromatics",
      "toppings",
    ],
    courseGroups: ["main-course", "street-snack"],
    relatedFamilies: ["noodle-soup", "pasta"],
    representativeDishes: [
      "Ramen",
      "Pho",
      "Laksa",
      "Soto Mie",
      "Khao Soi",
      "Udon",
      "Mie Ayam",
      "Bakso",
      "Saimin",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "The transmission from Chinese lamian to Japanese ramen is well documented (Chinese immigrants in Yokohama, late 19th century). The link between Asian noodle soups and Italian pasta is more contested — both derive from noodle-making traditions that may share ancient Central Asian roots, but the parallel-evolution hypothesis is also strong.",
    culturalPracticeNote:
      "Slurping noodles is the polite way to eat ramen in Japan (it cools the noodles and shows appreciation). Pho is a breakfast food in Vietnam. Khao Soi is a regional specialty of northern Thailand with Burmese-Muslim influences.",
    sourceNotes:
      "Wikipedia: Noodle soup, Ramen, Pho, Laksa; George Solt, The Untold History of Ramen (2014); Lucien X. Polastron, The Book of Noodles (2013).",
    displayOrder: 40,
    dishMappings: [
      {
        dishSlug: "ramen-japanese",
        role: "adaptation",
        explanation:
          "Wheat noodles in a meat or fish broth with tare (seasoning base) and toppings. Adapted from Chinese lamian by immigrants in late-19th-century Japan; evolved into a fully Japanese dish with dashi and shoyu.",
        changedElements: ["serving_context", "spice_profile", "ingredient"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "pho-vietnamese",
        role: "fusion",
        explanation:
          "Rice noodles in beef or chicken broth with star anise, cinnamon, and charred onion. Combines Chinese noodle technique with Vietnamese broth traditions; emerged in northern Vietnam in the early 20th century.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "pad-thai",
        role: "regional_variant",
        explanation:
          "Stir-fried rice noodles with tamarind, fish sauce, peanuts, and lime. A 20th-century Thai nationalist dish that incorporates Chinese noodle technique with local Southeast Asian flavors.",
        changedElements: ["cooking_method", "spice_profile", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 7,
      },
      {
        dishSlug: "tom-yum",
        role: "cousin",
        explanation:
          "Hot-and-sour Thai soup, often served with rice or noodles. Shares 'broth + aromatics' with noodle soups but the dish itself is soup-with-optional-noodles, not noodles-in-broth.",
        changedElements: ["serving_context", "spice_profile"],
        confidenceLevel: "possible",
        sortOrder: 5,
      },
    ],
  },

  // ─── 5. Stuffed leaves and vegetables lineage ──────────────────────
  {
    slug: "stuffed-leaves",
    name: "Stuffed Leaves and Vegetables",
    shortDescription:
      "Edible wrappers — vine leaves, cabbage, peppers, tomatoes, eggplant — filled with grains, herbs, meat, or legumes, then braised. A Mediterranean-to-Central-Asian family with deep ritual roots.",
    longDescription:
      "The idea of stuffing a vegetable or leaf and slow-cooking it appears across the Mediterranean, the Levant, the Caucasus, and Central Asia. The Greek gemista, Turkish dolma, Armenian tolma, and Lebanese stuffed grape leaves (warak enab) form a coherent family. The form has ritual roots: stuffed vegetables are festival food across multiple cultures, including Greek Easter, Ottoman celebrations, and Levantine family gatherings.",
    conceptSummary:
      "An edible wrapper or vessel filled with a seasoned grain or meat mixture, then slow-braised until the wrapper softens and absorbs the filling's flavor.",
    originSummary:
      "Stuffed vegetables are documented in Ottoman and Persian court cuisines by the medieval period. The technique likely predates the Ottoman Empire through Persian and Arab cookery. Related forms (cabbage rolls) exist independently in Eastern European cuisine.",
    originRegions: ["Ottoman Empire", "Levant", "Persia"],
    relatedRegions: [
      "Greece",
      "Turkey",
      "Armenia",
      "Lebanon",
      "Egypt",
      "Eastern Europe",
    ],
    historicalForces: ["empire", "religious_exchange", "cultural_exchange"],
    primaryTechnique: "filling-then-braising",
    techniques: ["rolling", "braising", "baking", "simmering in oil and lemon"],
    baseIngredients: [
      "grape leaves",
      "cabbage",
      "peppers",
      "tomatoes",
      "zucchini",
      "rice",
      "minced meat",
      "herbs",
      "olive oil",
      "lemon",
    ],
    courseGroups: ["appetizer", "main-course", "side"],
    relatedFamilies: ["casserole", "stew"],
    representativeDishes: [
      "Dolma",
      "Sarma",
      "Gemista",
      "Stuffed Peppers",
      "Cabbage Rolls",
      "Warak Enab",
      "Tolma",
      "Yaprak Sarma",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "Eastern European cabbage rolls (holubtsi, golabki, sarma) are related to the Ottoman stuffed-grape-leaves family but the precise route of transmission is debated. Some scholars argue parallel invention; others argue Ottoman influence via the Balkans.",
    culturalPracticeNote:
      "In Armenian, Levantine, and Greek households, the preparation of stuffed vegetables is a multi-generational activity — usually women and older girls, with the eldest supervising the rolling technique.",
    sourceNotes:
      "Wikipedia: Dolma, Gemista, Cabbage roll; Priscilla Parkhurst Ferguson, Accounting for Taste (2004); Anissa Helou, Mediterranean Street Food (2014).",
    displayOrder: 50,
    dishMappings: [
      {
        dishSlug: "moussaka-greek",
        role: "cousin",
        explanation:
          "Greek moussaka is a layered casserole (eggplant, meat, béchamel) rather than a stuffed-leaf dish, but it shares the 'assembled-and-baked vegetable' logic with gemista and is part of the broader Ottoman-influenced Greek repertoire.",
        changedElements: ["shape", "cooking_method", "serving_context"],
        confidenceLevel: "possible",
        sortOrder: 4,
      },
      {
        dishSlug: "hummus",
        role: "uncertain",
        explanation:
          "Chickpea-tahini spread, a Levantine staple. Listed here as 'uncertain' because hummus is not stuffed but the dish is a frequent partner to stuffed leaves in the same meal context.",
        changedElements: ["serving_context"],
        confidenceLevel: "uncertain",
        sortOrder: 2,
      },
    ],
  },

  // ─── 6. Skewered and grilled meat lineage ──────────────────────────
  {
    slug: "skewered-grilled-meat",
    name: "Skewered and Grilled Meat",
    shortDescription:
      "Small pieces or minced meat threaded on sticks and cooked over open fire — shaped by street food, nomadic cooking, ritual, and marinades across Eurasia and beyond.",
    longDescription:
      "Skewered meat appears across most grilling cultures: shish kebab (Persian/Turkish), satay (Indonesian/Malaysian), yakitori (Japanese), souvlaki (Greek), anticuchos (Andean), brochettes (French), seekh kebab (South Asian). The shared idea is small pieces + fire + marinade + stick, but the marinade, protein, and context vary widely. Some forms are clearly connected by trade and empire (kebab across Ottoman-influenced regions); others are parallel inventions.",
    conceptSummary:
      "Small pieces of meat or offal on a stick, cooked over fire. The marinade and the context (street food, festival, daily meal) are the cultural signature.",
    originSummary:
      "Skewered cooking likely emerged independently wherever open-fire cooking met nomadic or street-food culture. Persian kebab traditions spread through the Ottoman Empire; satay likely reflects Indian-Muslim trade influence on Indonesian cuisine; yakitori developed in Edo-period Japan.",
    originRegions: [
      "Persian Plateau",
      "Anatolia",
      "Levant",
      "Indian subcontinent",
      "Southeast Asia",
      "Andean region",
    ],
    relatedRegions: [
      "Greece",
      "Turkey",
      "Japan",
      "Indonesia",
      "Malaysia",
      "Peru",
      "Mongolia",
    ],
    historicalForces: [
      "empire",
      "trade_route",
      "nomadic_pastoral",
      "parallel_evolution",
    ],
    primaryTechnique: "skewer-and-grill",
    techniques: [
      "skewering",
      "marinating",
      "open-flame grilling",
      "charcoal grilling",
    ],
    baseIngredients: [
      "lamb",
      "beef",
      "chicken",
      "pork",
      "offal",
      "yogurt",
      "spice pastes",
      "soy sauce",
      "peanut sauce",
    ],
    courseGroups: ["main-course", "street-snack", "appetizer"],
    relatedFamilies: ["kebab"],
    representativeDishes: [
      "Kebab",
      "Satay",
      "Yakitori",
      "Souvlaki",
      "Anticucho",
      "Shashlik",
      "Brochette",
      "Seekh Kebab",
      "Chuan'r",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "The link between Persian kebab and Greek souvlaki is debated: Ottoman influence is likely, but Greek grilling traditions predate the Ottoman Empire. Japanese yakitori and Andean anticuchos are parallel inventions, not descendants of the Persian tradition.",
    culturalPracticeNote:
      "Satay is the national street food of Indonesia, with regional variations from Madura (sweet, ketupat accompaniment) to Padang (thick yellow sauce). Anticuchos are tied to the Afro-Peruvian cooking tradition, using beef heart — a legacy of African diaspora and Andean guinea-pig (cuy) cooking.",
    sourceNotes:
      "Wikipedia: Kebab, Satay, Yakitori, Anticucho; Anissa Helou, Lebanon: A Culinary Journey (2012); Sarah Lohman, Endangered Eating (2022).",
    displayOrder: 60,
    dishMappings: [
      {
        dishSlug: "shawarma",
        role: "cousin",
        explanation:
          "Levantine spit-roasted meat, shaved and served in flatbread. Related to doner kebab (Ottoman/Turkish) and döner (modern Turkish). Shares the grilled-meat-as-meal idea with kebab but uses vertical spit roasting.",
        changedElements: ["cooking_method", "shape", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "tacos-al-pastor",
        role: "cousin",
        explanation:
          "Mexican pork tacos cooked on a vertical spit (trompo), served on small tortillas with pineapple, onion, and cilantro. The spit-roasting technique is Lebanese-immigrant influence (shawarma arrived in Mexico via Lebanese diaspora in the 19th–20th century); the tortilla, pineapple, and chili are local Mexican elements.",
        changedElements: [
          "ingredient",
          "cooking_method",
          "serving_context",
          "spice_profile",
        ],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
    ],
  },

  // ─── 7. Curry / spiced stew lineage ────────────────────────────────
  {
    slug: "curry-spiced-stew",
    name: "Curry and Spiced Stew",
    shortDescription:
      "Spiced sauce/stew systems — but not one thing. Local names, local spice logic, local techniques. A lineage of related ideas rather than a single dish.",
    longDescription:
      "The word 'curry' is a European colonial-era label for an enormous range of spiced dishes across South Asia, Southeast Asia, Japan, and the Caribbean. Indian curry traditions are anchored by regional spice blends (garam masala, sambar powder, vindaloo masala). Thai, Japanese, and Malaysian curry traditions are related through trade and Buddhist-Muslim exchange but developed distinct spice profiles. Caribbean curry reflects Indian indentured-labour diaspora. Rendang is a dry-spiced slow-cooked meat from Minangkabau cuisine, related to curry but distinct.",
    conceptSummary:
      "A spiced sauce or stew where the spice blend is the cultural signature, not the protein.",
    originSummary:
      "Spiced stews are ancient in the Indian subcontinent (sambar, kuzhambu). Trade carried curry traditions to Southeast Asia (Thai massaman, Malay laksa paste, Indonesian rendang), East Asia (Japanese curry via British colonial influence), and the Caribbean (via Indian indentured labour in the 19th century).",
    originRegions: ["Indian subcontinent"],
    relatedRegions: [
      "Thailand",
      "Japan",
      "Malaysia",
      "Indonesia",
      "Caribbean",
      "South Africa",
    ],
    historicalForces: [
      "trade_route",
      "colonial_spread",
      "diaspora",
      "religious_exchange",
    ],
    primaryTechnique: "spice-paste-cooking",
    techniques: [
      "dry-roasting spices",
      "wet grinding",
      "tempering (tadka)",
      "slow braising",
      "coconut-milk reduction",
    ],
    baseIngredients: [
      "turmeric",
      "cumin",
      "coriander",
      "chili",
      "ginger",
      "garlic",
      "coconut milk",
      "yogurt",
      "onion",
      "tomato",
    ],
    courseGroups: ["main-course"],
    relatedFamilies: ["curry", "stew"],
    representativeDishes: [
      "Indian Curry",
      "Thai Curry",
      "Japanese Curry",
      "Kari Ayam",
      "Rendang",
      "Massaman Curry",
      "Dal",
      "Tagine",
      "Vindaloo",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "The link between Indian curry and Thai massaman is documented (massaman derives from the Malay word 'masam' meaning sour, and the spice profile reflects Persian/Indian trade). The link between Indian curry and Japanese curry is more recent — late-19th-century British colonial influence. Caribbean curry reflects 19th-century Indian diaspora.",
    culturalPracticeNote:
      "Rendang is cooked for hours until the coconut milk is fully absorbed and the spices caramelize on the meat — it's a Minangkabau ceremonial dish. Japanese curry is a weekly staple and is often considered a 'homestyle' dish.",
    sourceNotes:
      "Wikipedia: Curry, Massaman curry, Rendang, Japanese curry; Colleen Taylor Sen, Curry: A Global History (2009); Sri Owen, The Rice Book (1993).",
    displayOrder: 70,
    dishMappings: [
      {
        dishSlug: "chicken-tikka-masala",
        role: "regional_variant",
        explanation:
          "Roasted chicken chunks in a creamy tomato-onion sauce with garam masala. Often called a British-Indian dish — likely invented in the UK by Bangladeshi chefs in the 1960s. A diaspora adaptation of Indian murgh makhani.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
      {
        dishSlug: "rendang",
        role: "regional_variant",
        explanation:
          "Minangkabau slow-cooked dry curry: beef simmered in coconut milk and spice paste for hours until dry and deeply caramelized. A distinct Indonesian curry tradition.",
        changedElements: ["cooking_method", "serving_context", "spice_profile"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "parallel_evolution",
        explanation:
          "Korean kimchi stew: fermented kimchi simmered with pork or tuna. A spiced stew with a fermented base — shares the 'spice-forward slow-cooked stew' idea with curry but the spice profile and base are entirely distinct.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 4,
      },
      {
        dishSlug: "tagine-moroccan",
        role: "cousin",
        explanation:
          "Moroccan slow-cooked stew named after the clay pot. Spiced with ras el hanout and preserved lemon. Shares 'slow-cooked spiced stew' with curry but uses North African spice traditions.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 5,
      },
      {
        dishSlug: "goulash-hungarian",
        role: "cousin",
        explanation:
          "Hungarian beef stew with paprika, onion, and sometimes peppers and potatoes. A Central European spiced stew — shares 'spiced braised meat' with curry but uses Hungarian paprika as the signature spice.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 5,
      },
      {
        dishSlug: "vindaloo",
        role: "regional_variant",
        explanation:
          "Goan Portuguese-influenced curry: meat marinated in vinegar, garlic, and chili. Reflects Portuguese colonial influence on Indian cooking; the name derives from Portuguese 'carne de vinha d'alhos' (meat in wine vinegar and garlic).",
        changedElements: ["spice_profile", "ingredient", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 7,
      },
    ],
  },

  // ─── 8. Fermented soy and bean products lineage ───────────────────
  {
    slug: "fermented-bean",
    name: "Fermented Soy and Bean Products",
    shortDescription:
      "Beans transformed by microbial fermentation into umami-dense condiments, pastes, and solids — preservation, religion, regional bean-processing traditions.",
    longDescription:
      "Fermented bean products are deeply East Asian, with regional traditions stretching from Japanese miso and natto to Korean doenjang and gochujang to Indonesian tempeh to Chinese doubanjiang and soy sauce. Soy domestication is in northern China; fermentation techniques then radiated across East and Southeast Asia. The products are often tied to Buddhist vegetarian cooking (which favored plant-based protein) and to preservation in pre-refrigeration societies.",
    conceptSummary:
      "Beans + salt + time + microbial transformation = a concentrated source of umami and a powerful preservative.",
    originSummary:
      "Soy fermentation likely emerged in China during the Zhou dynasty (c. 1000 BCE). Tempeh spread from Indonesia through Dutch colonial trade. Japanese miso and Korean doenjang developed independently from Chinese soy paste traditions.",
    originRegions: ["Northern China"],
    relatedRegions: [
      "Japan",
      "Korea",
      "Indonesia",
      "Southeast Asia",
      "India",
      "Nepal",
    ],
    historicalForces: [
      "agricultural_spread",
      "religious_exchange",
      "trade_route",
    ],
    primaryTechnique: "fermentation",
    techniques: [
      "solid-state fermentation",
      "liquid fermentation",
      "mold cultivation",
      "long aging",
    ],
    baseIngredients: [
      "soybeans",
      "salt",
      "water",
      "grains (rice, barley, wheat)",
      "chili",
      "koji mold",
    ],
    courseGroups: ["condiment", "side", "main-course"],
    relatedFamilies: ["fermented", "sauce"],
    representativeDishes: [
      "Tempeh",
      "Miso",
      "Natto",
      "Soy Sauce",
      "Doenjang",
      "Gochujang",
      "Tauco",
      "Tofu",
      "Doubanjiang",
      "Miso Soup",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "The transmission from Chinese soy paste to Korean doenjang and Japanese miso is well documented through trade and Buddhist monastic exchange. The link to Indonesian tempeh is more debated — possibly independent fermentation of local beans (temu, before soy arrived).",
    culturalPracticeNote:
      "Miso is considered a daily staple in Japan, used in miso soup at breakfast and as a base for many sauces. Gochujang is used in Korean ancestral rites — the fermented red paste is offered to ancestors during Lunar New Year.",
    sourceNotes:
      "Wikipedia: Tempeh, Miso, Soy sauce, Doenjang, Gochujang; Shurtleff & Aoyagi, The Book of Miso (1976); Han Kee-sue, Gochujang: Korea's Favorite Condiment (2018).",
    displayOrder: 80,
    dishMappings: [
      {
        dishSlug: "mapo-tofu",
        role: "regional_variant",
        explanation:
          "Sichuan tofu in a fermented bean paste and doubanjiang sauce with chili and sichuan pepper. A direct descendant of the Chinese fermented-bean lineage, served as a tofu dish.",
        changedElements: ["serving_context", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "cousin",
        explanation:
          "Korean stew using aged kimchi and often doenjang. Shares the 'fermented base + slow-cooked stew' idea with Chinese fermented bean pastes but the kimchi fermentation is distinct.",
        changedElements: ["ingredient", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 5,
      },
    ],
  },

  // ─── 9. Fried dough and pastry lineage ─────────────────────────────
  {
    slug: "fried-dough-pastry",
    name: "Fried Dough and Pastry",
    shortDescription:
      "Dough fried in fat, then sweetened or savoured — festival food, street food, religious fast-day food.",
    longDescription:
      "Fried dough appears across cultures, often tied to religious calendars (Lenten doughnuts before Easter, Hanukkah sufganiyot, Diwali gujia, Ramadan sfenj). The link between Old-World fried doughs is partially historical (European doughnuts likely influenced by Dutch oliekoeken, which spread via trade) and partially parallel (every grain culture has a fried-dough tradition). Churros may have Portuguese or Moorish roots; loukoumades are Greek with possible Egyptian antecedents.",
    conceptSummary:
      "Wheat or rice flour dough, deep-fried, often sugared, often shaped (rings, sticks, balls, twists). Festival food almost universally.",
    originSummary:
      "Multiple origins. Fried dough appears in ancient Mediterranean, Indian, and East Asian cuisines. Specific forms — churros, loukoumades, jalebi, youtiao — have distinct documented histories.",
    originRegions: ["Mediterranean", "South Asia", "East Asia"],
    relatedRegions: [
      "Iberia",
      "Mesoamerica",
      "Southeast Asia",
      "North Africa",
      "Middle East",
    ],
    historicalForces: [
      "trade_route",
      "religious_exchange",
      "cultural_exchange",
      "parallel_evolution",
    ],
    primaryTechnique: "deep-frying",
    techniques: [
      "deep-frying",
      "shaping by hand or mold",
      "syrup-glazing",
      "sugar-dusting",
    ],
    baseIngredients: [
      "wheat flour",
      "rice flour",
      "yeast",
      "eggs",
      "sugar",
      "honey",
      "oil",
    ],
    courseGroups: ["dessert", "street-snack"],
    relatedFamilies: ["dessert", "street-snack"],
    representativeDishes: [
      "Donut",
      "Churros",
      "Loukoumades",
      "Jalebi",
      "Beignet",
      "Zeppole",
      "Youtiao",
      "Sfenj",
      "Gujia",
      "Boortsog",
    ],
    confidenceLevel: "likely",
    uncertaintyNote:
      "The link between Spanish churros and Portuguese filhós is debated; both derive from a Mediterranean fried-pastry tradition. The link between Indian jalebi and Middle Eastern zalabiya is documented (the name and shape travelled). The relationship between East Asian youtiao and European fried dough is largely parallel invention.",
    culturalPracticeNote:
      "Youtiao (oil strip) is eaten with congee for breakfast across China. Churros are a Spanish late-night snack. Jalebi is offered at Hindu temples and is central to Diwali celebrations.",
    sourceNotes:
      "Wikipedia: Churro, Jalebi, Loukoumades, Youtiao; Gil Marks, Encyclopedia of Jewish Food (2010); Michael Krondl, Sweet Invention (2011).",
    displayOrder: 90,
    dishMappings: [
      {
        dishSlug: "tiramisu",
        role: "uncertain",
        explanation:
          "Italian coffee-flavored dessert with mascarpone and soaked ladyfingers. Not fried — included to flag a known gap in Gustale's coverage of fried-dough and pastry forms.",
        changedElements: [],
        confidenceLevel: "uncertain",
        sortOrder: 1,
      },
    ],
  },

  // ─── 10. Preserved fish and fermented seafood lineage ──────────────
  {
    slug: "preserved-fish",
    name: "Preserved Fish and Fermented Seafood",
    shortDescription:
      "Salt, fermentation, and time transform fish and shellfish into umami-dense condiments and pastes — a coastal foodway that links the Mediterranean to Southeast Asia.",
    longDescription:
      "Fermented fish sauce is one of the oldest condiments in the world: Roman garum (made from fish guts and salt) was a Mediterranean staple for centuries, and nuoc mam (Vietnamese), patis (Filipino), nam pla (Thai), and shottsuru (Japanese) all derive from the same basic process — salt + fish + time = liquid umami. Anchovy paste, shrimp paste (terasi/belacan), and aged fish pastes like Thai pla ra represent different ends of the same logic.",
    conceptSummary:
      "Fish + salt + fermentation time = a concentrated source of salt and umami. Used as a condiment, a cooking base, or a finishing note.",
    originSummary:
      "Fish fermentation is documented in ancient Mediterranean (garum), Southeast Asia (fish sauces of the Austronesian world), and East Asia. The technique appears independently in coastal cultures with abundant fish stocks and salt.",
    originRegions: ["Mediterranean", "Southeast Asia", "East Asia"],
    relatedRegions: [
      "Italy",
      "Vietnam",
      "Thailand",
      "Philippines",
      "Japan",
      "Korea",
      "Rome",
    ],
    historicalForces: [
      "trade_route",
      "cultural_exchange",
      "parallel_evolution",
    ],
    primaryTechnique: "salt-fermentation",
    techniques: [
      "salt curing",
      "liquid fermentation",
      "paste fermentation",
      "long aging",
    ],
    baseIngredients: ["small fish", "shrimp", "salt", "water"],
    courseGroups: ["condiment", "side"],
    relatedFamilies: ["sauce", "fermented"],
    representativeDishes: [
      "Garum",
      "Fish Sauce (Nuoc Mam)",
      "Shrimp Paste (Belacan)",
      "Pla Ra",
      "Bagoong",
      "Cincalok",
      "Anchovy Paste",
      "Colatura di Alici",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "The parallel between Roman garum and Southeast Asian fish sauces is well documented as parallel invention rather than direct transmission. Korean salted shrimp (saeu-jeot) and Japanese shiokara are part of the same coastal-fermentation family.",
    culturalPracticeNote:
      "In Vietnam, nuoc mam is a daily condiment and a marker of family identity — every family has its preferred brand and source. Garum was so central to Roman cooking that it was a major industry in Pompeii and salted-fish factories dotted the Mediterranean coast.",
    sourceNotes:
      'Wikipedia: Garum, Fish sauce, Shrimp paste, Pla ra; Eric C. Barrett, "The Shape of Roman Fishing Economy" (2019); Penny Van Esterik, "Fish Sauce in Southeast Asian Foodways" (1992).',
    displayOrder: 100,
    dishMappings: [],
  },

  // ─── 11. Chili sauce and condiment lineage ─────────────────────────
  {
    slug: "chili-condiment",
    name: "Chili Sauces and Condiments",
    shortDescription:
      "Chili as a post-Columbian global ingredient — ground, fermented, and preserved into local condiment systems. Sambal, harissa, salsa, gochujang, sriracha — same ingredient, five continents of adaptation.",
    longDescription:
      "All chili peppers descend from plants domesticated in Mesoamerica. They reached the rest of the world only after the Columbian Exchange (post-1492). Yet within 200 years, chili had been absorbed into virtually every cuisine: sambal in Indonesia/Malaysia, harissa in North Africa, salsa in Mexico, gochujang in Korea, Sichuan chili oil in China, chili paste in Sichuan. Each tradition developed its own grinding, fermenting, and preserving logic.",
    conceptSummary:
      "Chili + local grinding/fermenting/preserving = a condiment that becomes the signature flavor of a regional table.",
    originSummary:
      "Chili domestication is in central Mexico (c. 6000 BCE). After 1492, chili spread to the Philippines (via Spanish galleon trade), then to China, India, Southeast Asia, Africa, and the Middle East. Each region integrated it into existing condiment traditions.",
    originRegions: ["Mesoamerica"],
    relatedRegions: [
      "Mexico",
      "Peru",
      "Korea",
      "Sichuan",
      "Indonesia",
      "Malaysia",
      "North Africa",
      "Thailand",
    ],
    historicalForces: [
      "colonial_spread",
      "agricultural_spread",
      "local_adaptation",
    ],
    primaryTechnique: "grinding-and-fermenting",
    techniques: [
      "stone-grinding",
      "mortar-grinding",
      "fermentation",
      "oil-infusion",
      "smoking",
    ],
    baseIngredients: [
      "chili peppers",
      "salt",
      "garlic",
      "vinegar",
      "sugar",
      "oil",
      "fermented bean paste",
    ],
    courseGroups: ["condiment", "sauce"],
    relatedFamilies: ["sauce", "fermented"],
    representativeDishes: [
      "Sambal",
      "Harissa",
      "Salsa Roja",
      "Gochujang",
      "Sriracha",
      "Ajvar",
      "Zhug",
      "Nam Prik",
      "Chili Oil",
      "Shatta",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "All chili condiments share a common ancestor (Mesoamerican domesticated chili), but the preparation methods diverged radically — sambal is fresh-ground chili, harissa is a wet paste, gochujang is fermented with soybeans. We list this as a lineage because the shared ingredient is the spine; the variations are the story.",
    culturalPracticeNote:
      "Gochujang is used in Korean ancestral rites and is one of the three foundational sauces (with soy sauce and doenjang). Sambal is the daily chili accompaniment in Indonesia and Malaysia — every meal has sambal. Harissa is central to Maghrebi identity and is eaten with almost every savory dish in Tunisia.",
    sourceNotes:
      "Wikipedia: Sambal, Harissa, Gochujang, Sriracha; Dave DeWitt, The Chili Pepper Encyclopedia (2011); Seung-hee Lee, Gochujang: A Korean Fermented Condiment (2019).",
    displayOrder: 110,
    dishMappings: [
      {
        dishSlug: "soto-ayam",
        role: "cousin",
        explanation:
          "Indonesian chicken soup with sambal and lime. Sambal is the chili condiment backbone of Indonesian cuisine; soto-ayam is one of many dishes built around it.",
        changedElements: ["serving_context"],
        confidenceLevel: "documented",
        sortOrder: 3,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "cousin",
        explanation:
          "Korean stew often seasoned with gochujang or served with kimchi. The chili-condiment backbone of Korean cuisine.",
        changedElements: ["serving_context"],
        confidenceLevel: "documented",
        sortOrder: 3,
      },
    ],
  },

  // ─── 12. Wrapped leaf / packet cooking lineage ─────────────────────
  {
    slug: "wrapped-leaf",
    name: "Wrapped Leaf and Packet Cooking",
    shortDescription:
      "Food wrapped in leaves for steaming, grilling, carrying, preserving, or ritual — banana leaves, corn husks, palm leaves, lotus leaves, bamboo leaves.",
    longDescription:
      "Leaf-wrapped cooking is one of the oldest portable-food techniques: tamales in Mesoamerica, zongzi in China, pepes in Indonesia, otak-otak in Singapore, pasteles in the Caribbean, bánh chưng in Vietnam, lemper in Java, bacalhau com natas in Portugal. The shared idea is the leaf as a cooking vessel, flavoring agent, and preservation wrap. The technique is ritual-heavy: tamales for Day of the Dead, zongzi for Dragon Boat Festival, bánh chưng for Lunar New Year.",
    conceptSummary:
      "Food wrapped in leaves, then steamed, grilled, or boiled. The leaf contributes flavor, structure, and ritual meaning.",
    originSummary:
      "Leaf-wrapping appears independently in Mesoamerica (corn-husk tamales), East Asia (bamboo-leaf zongzi), and Southeast Asia (banana-leaf pepes). Each tradition is tied to local grain agriculture and ritual cycles.",
    originRegions: ["Mesoamerica", "East Asia", "Southeast Asia"],
    relatedRegions: [
      "Mexico",
      "China",
      "Vietnam",
      "Indonesia",
      "Caribbean",
      "Singapore",
    ],
    historicalForces: [
      "religious_exchange",
      "agricultural_spread",
      "parallel_evolution",
      "war_and_displacement",
    ],
    primaryTechnique: "leaf-wrapping-and-steaming",
    techniques: [
      "steaming in leaves",
      "grilling in leaves",
      "boiling in leaves",
      "long steaming",
    ],
    baseIngredients: [
      "corn husks",
      "banana leaves",
      "bamboo leaves",
      "lotus leaves",
      "palm leaves",
      "rice",
      "meat",
      "fish",
      "coconut",
    ],
    courseGroups: ["main-course", "snack", "festival-food"],
    relatedFamilies: ["casserole", "steamed-and-custard"],
    representativeDishes: [
      "Tamales",
      "Pepes",
      "Otak-Otak",
      "Zongzi",
      "Pasteles",
      "Lemper",
      "Bánh Chưng",
      "Pamonha",
      "Hallaca",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "All leaf-wrapped foods share the 'leaf as vessel' logic but emerged independently in multiple continents. The Mesoamerican tamal tradition predates European contact by thousands of years; Chinese zongzi dates back at least to the Warring States period. They are parallel inventions, not transmissions.",
    culturalPracticeNote:
      "Bánh chưng is the symbolic dish of Vietnamese Lunar New Year (Tết): the square shape represents the Earth, the filling represents prosperity. Tamales are central to Mesoamerican Day of the Dead (Día de los Muertos) celebrations, with families gathering to make them together.",
    sourceNotes:
      "Wikipedia: Tamale, Zongzi, Otak-Otak, Bánh chưng; Rachel Laudan, Cuisine and Empire (2013); Jeffrey Pilcher, ¡Que vivan los tamales! (1998).",
    displayOrder: 120,
    dishMappings: [
      {
        dishSlug: "dim-sum",
        role: "cousin",
        explanation:
          "Cantonese small filled parcels often steamed in bamboo baskets. Shares the leaf-wrapped-steamed idea with zongzi but evolved as a tea-house tradition.",
        changedElements: ["serving_context", "wrapper", "shape"],
        confidenceLevel: "likely",
        sortOrder: 4,
      },
    ],
  },

  // ─── 13. Fermented batter / sour grain lineage ─────────────────────
  {
    slug: "fermented-batter",
    name: "Fermented Batter and Sour Grain",
    shortDescription:
      "Grain or legume batter transformed by natural fermentation, then cooked on a griddle, pan, or steamer — a global family from Ethiopian injera to South Indian dosa.",
    longDescription:
      "Fermented batters appear across most grain cuisines: Ethiopian injera (teff), South Indian dosa and idli (rice and lentil), appam (rice and coconut), sourdough pancakes, Russian blini. The shared logic is grain + water + wild fermentation + heat. These batters are leavened by the fermentation rather than by commercial yeast.",
    conceptSummary:
      "Grain or legume batter, naturally fermented, then cooked thin on a hot surface.",
    originSummary:
      "Fermented batter cooking is documented in Ethiopia (teff) and South India (rice-lentil) at least 2000 years ago, almost certainly independently. Sourdough pancake traditions in Eastern Europe and Russia are part of the same logic but with wheat flour.",
    originRegions: ["Ethiopian Highlands", "South India", "Eastern Europe"],
    relatedRegions: [
      "India",
      "Sri Lanka",
      "Russia",
      "Ukraine",
      "Ethiopia",
      "Eritrea",
    ],
    historicalForces: [
      "parallel_evolution",
      "religious_exchange",
      "cultural_exchange",
    ],
    primaryTechnique: "fermented-batter-cooking",
    techniques: [
      "long fermentation",
      "griddle cooking",
      "steaming (for idli)",
      "thin pouring",
    ],
    baseIngredients: [
      "teff flour",
      "rice flour",
      "lentil flour",
      "wheat flour",
      "sourdough starter",
      "salt",
      "water",
    ],
    courseGroups: ["main-course", "side", "bread"],
    relatedFamilies: ["pancake", "bread"],
    representativeDishes: [
      "Injera",
      "Dosa",
      "Idli",
      "Appam",
      "Sourdough Pancakes",
      "Blini",
      "Dhokla",
      "Pesarattu",
    ],
    confidenceLevel: "documented",
    uncertaintyNote:
      "Injera (teff), dosa (rice-lentil), and Russian blini (wheat) are parallel inventions — the same logic, three different continents, three different grains. They form a lineage because the shared technique is the spine, not the grain or the geography.",
    culturalPracticeNote:
      "In Ethiopia and Eritrea, injera is the plate: stews and salads are served on top, and you eat by tearing off pieces of injera with your right hand. South Indian dosa is often eaten with coconut chutney and sambar; idli with sambar and a variety of chutneys.",
    sourceNotes:
      "Wikipedia: Injera, Dosa, Idli, Blini; Michael Batterson, Ethiopian Cookbook (2020); K. T. Achaya, A Historical Dictionary of Indian Food (1998).",
    displayOrder: 130,
    dishMappings: [
      {
        dishSlug: "dosa",
        role: "ancestor",
        explanation:
          "South Indian dosa: fermented rice and lentil batter cooked thin on a griddle. A canonical example of the fermented-batter lineage. Often served with coconut chutney and sambar.",
        changedElements: ["serving_context", "shape"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
    ],
  },

  // ─── 14. Stuffed pasta / filled pasta lineage ─────────────────────
  {
    slug: "stuffed-pasta",
    name: "Stuffed Pasta and Filled European Dough",
    shortDescription:
      "Filled dough in European and Eurasian branches — ravioli, tortellini, agnolotti, maultaschen, pelmeni, vareniki, pierogi. Connected to the broader filled-dough lineage but with European and Slavic specifics.",
    longDescription:
      "Stuffed pasta is the European wing of the filled-dough family. Italian ravioli and tortellini (with roots in Roman lagana and medieval Renaissance cuisine), Slavic pelmeni and vareniki, German Maultaschen, and Polish pierogi all share the 'filled dough' logic. The relationship to Central Asian manti and East Asian jiaozi is debated — direct Silk Road transmission vs. shared Mediterranean + Levantine roots.",
    conceptSummary:
      "Filled wheat dough, often served in broth or with butter and cheese, distinguished by filling and shape.",
    originSummary:
      "Italian stuffed pasta is documented in the 14th century (Bolognese ravioli references); pelmeni are documented in Siberian cuisine from the 15th century onward. Whether they share a Silk Road ancestor or arose from parallel Mediterranean + Slavic traditions is unresolved.",
    originRegions: ["Italy", "Siberia", "Eastern Europe", "Germany"],
    relatedRegions: [
      "Italy",
      "Siberia",
      "Ukraine",
      "Poland",
      "Germany",
      "Slovenia",
      "Romania",
    ],
    historicalForces: [
      "trade_route",
      "parallel_evolution",
      "cultural_exchange",
    ],
    primaryTechnique: "filling-and-sealing",
    techniques: [
      "boiling",
      "sautéing in butter",
      "serving in broth",
      "pan-frying",
    ],
    baseIngredients: [
      "wheat flour",
      "egg",
      "ricotta",
      "potato",
      "sauerkraut",
      "minced meat",
      "mushroom",
      "onion",
    ],
    courseGroups: ["main-course", "appetizer"],
    relatedFamilies: ["pasta", "dumpling"],
    representativeDishes: [
      "Ravioli",
      "Tortellini",
      "Agnolotti",
      "Maultaschen",
      "Pelmeni",
      "Vareniki",
      "Pierogi",
      "Cappelletti",
      "Kalduny",
    ],
    confidenceLevel: "possible",
    uncertaintyNote:
      "The link between Italian stuffed pasta and Slavic pelmeni is debated. Some scholars argue Silk Road transmission from Central Asian manti; others argue parallel European and Slavic invention. We list this as a separate lineage because the European and Slavic forms have enough local character to be studied on their own, while still flagging the overlap with the broader filled-dough lineage.",
    culturalPracticeNote:
      "Tortellini are stuffed with a meat-and-cheese filling and served in capon broth, especially around Christmas and New Year in Emilia-Romagna. Pelmeni are central to Siberian cuisine and are often frozen in bulk for winter. Pierogi are served at Polish Christmas Eve dinner.",
    sourceNotes:
      "Wikipedia: Ravioli, Tortellini, Pelmeni, Pierogi; Oretta Zanini De Vita, Encyclopedia of Pasta (2009); Darra Goldstein, A Fork in the Road (2014).",
    displayOrder: 140,
    dishMappings: [
      {
        dishSlug: "pierogi",
        role: "regional_variant",
        explanation:
          "Polish filled dumplings: wheat-flour dough folded over potato-and-cheese, sauerkraut, mushroom, or meat filling, then boiled and often pan-fried. A Slavic regional variant of the broader filled-dough lineage.",
        changedElements: ["filling", "cooking_fat", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 8,
      },
      {
        dishSlug: "risotto-alla-milanese",
        role: "uncertain",
        explanation:
          "Italian saffron risotto. Listed here as uncertain because risotto is not a stuffed pasta but the Lombardy region also has stuffed pasta traditions (agnolotti) — overlap with the lineage.",
        changedElements: [],
        confidenceLevel: "uncertain",
        sortOrder: 1,
      },
    ],
  },
];
