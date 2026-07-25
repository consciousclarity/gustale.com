import type { SeedRelation } from "./types.js";

// =====================================================================
// DISH RELATIONS — the curated food-genealogy network.
// =====================================================================
//
// Each entry is a typed, directed edge between two dish slugs. The
// seeder reads this list and inserts rows into `dish_relations`.
//
// Strength scale (1=weak, 5=strong):
//   5  canonical anchor — strongest editorial claim ("is the same form")
//   4  very strong      — clear historical or technical relation
//   3  standard         — typical cluster-membership edge
//   2  weak             — distant cousin, often only one dimension matches
//   1  faint            — at-the-edge cases (kept for completeness)
//
// Reasons are short user-facing strings, no full sentences; they show up
// as the "why are these related" tooltip / subtitle on a related card.
/**
 * Curated dish-relation network.
 *
 * Conventions:
 *   - Relations are directed, but the seeder inserts the *reverse* row
 *     automatically (with the same reason + strength) so the UI can look
 *     up relations from either side without a join.
 *   - Dishes referenced here MUST exist in DISHES (either the original
 *     31 or the 30 added in this pass).
 */
export const DISH_RELATIONS: SeedRelation[] = [
  // ─── Dumpling cluster ──────────────────────────────────────────────────
  {
    from: "jiaozi",
    to: "momo",
    relationType: "family",
    reason: "Same filled-dough form, traded along the Silk Road",
    strength: 5,
  },
  {
    from: "jiaozi",
    to: "pierogi",
    relationType: "regional-cousin",
    reason: "Crescent-shaped filled dumplings of Eastern Europe and East Asia",
    strength: 4,
  },
  {
    from: "momo",
    to: "pierogi",
    relationType: "family",
    reason:
      "Both half-moon dumplings, related through Central Asian trade routes",
    strength: 4,
  },
  {
    from: "momo",
    to: "jiaozi",
    relationType: "shared-method",
    reason: "Both steamed in a bamboo or metal steamer",
    strength: 3,
  },

  // ─── Noodle soup cluster ───────────────────────────────────────────────
  {
    from: "ramen-japanese",
    to: "pho-vietnamese",
    relationType: "regional-cousin",
    reason:
      "Both Asian brothy noodle soups that crossed paths via Chinese diaspora",
    strength: 4,
  },
  {
    from: "ramen-japanese",
    to: "udon",
    relationType: "family",
    reason: "Both Japanese wheat-noodle dishes, ramen thinner and richer",
    strength: 5,
  },
  {
    from: "udon",
    to: "soba",
    relationType: "family",
    reason:
      "Both iconic Japanese noodle families, udon wheat vs soba buckwheat",
    strength: 5,
  },
  {
    from: "laksa",
    to: "pho-vietnamese",
    relationType: "regional-cousin",
    reason: "Both Southeast Asian noodle soups, laksa spiced with rempah",
    strength: 4,
  },
  {
    from: "laksa",
    to: "tom-yum",
    relationType: "shared-method",
    reason: "Both built on a pounded rempah (lemongrass-galangal-chili) base",
    strength: 5,
  },
  {
    from: "khao-soi",
    to: "laksa",
    relationType: "regional-cousin",
    reason: "Both coconut-curry noodle soups of the greater Mekong region",
    strength: 5,
  },
  {
    from: "khao-soi",
    to: "ramen-japanese",
    relationType: "family",
    reason: "Both noodle soups with a clear broth and protein topping",
    strength: 3,
  },

  // ─── Curry / spiced-sauce cluster ──────────────────────────────────────
  {
    from: "rendang",
    to: "chicken-tikka-masala",
    relationType: "shared-method",
    reason: "Both slow-cooked in a spice paste until the sauce reduces",
    strength: 4,
  },
  {
    from: "rendang",
    to: "goulash-hungarian",
    relationType: "family",
    reason: "Both paprika-and-onion spiced meat stews",
    strength: 4,
  },
  {
    from: "vindaloo",
    to: "chicken-tikka-masala",
    relationType: "regional-cousin",
    reason: "Both Indian restaurant-style curries, Goan vs Punjabi",
    strength: 4,
  },
  {
    from: "vindaloo",
    to: "biryani-hyderabadi",
    relationType: "family",
    reason: "Both Goan-Persian legacies in Indian cooking",
    strength: 3,
  },
  {
    from: "vindaloo",
    to: "bacalhau-a-bras",
    relationType: "ancestor",
    reason:
      "Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo",
    strength: 5,
  },
  {
    from: "chicken-tikka-masala",
    to: "biryani-hyderabadi",
    relationType: "family",
    reason: "Both pillars of restaurant-style South Asian cuisine",
    strength: 4,
  },

  // ─── Rice-dish cluster ─────────────────────────────────────────────────
  {
    from: "nasi-goreng",
    to: "jollof-rice",
    relationType: "regional-cousin",
    reason: "Both fried/tomato rice dishes at the heart of national identity",
    strength: 4,
  },
  {
    from: "nasi-goreng",
    to: "nasi-campur-bali",
    relationType: "family",
    reason: "Both Indonesian rice plates, nasi goreng is a single-dish version",
    strength: 5,
  },
  {
    from: "paella-valenciana",
    to: "risotto-alla-milanese",
    relationType: "shared-method",
    reason: "Both rice dishes built around a sofrito / soffritto base",
    strength: 4,
  },
  {
    from: "jollof-rice",
    to: "biryani-hyderabadi",
    relationType: "ancestor",
    reason:
      "Biryani's Persian-layered rice tradition is the documented ancestor of jollof",
    strength: 4,
  },
  {
    from: "risotto-alla-milanese",
    to: "paella-valenciana",
    relationType: "regional-cousin",
    reason: "Both short-grain rice dishes, Italian vs Iberian",
    strength: 4,
  },

  // ─── Indonesian / Balinese cluster ─────────────────────────────────────
  {
    from: "babi-guling",
    to: "sate-lilit",
    relationType: "regional-cousin",
    reason: "Both iconic Balinese ceremonial preparations",
    strength: 5,
  },
  {
    from: "babi-guling",
    to: "nasi-campur-bali",
    relationType: "regional-cousin",
    reason: "Babi guling is often the centerpiece of nasi campur Bali",
    strength: 5,
  },
  {
    from: "soto-ayam",
    to: "rawon",
    relationType: "regional-cousin",
    reason: "Both Indonesian clear soups with a spice-paste base",
    strength: 5,
  },
  {
    from: "soto-ayam",
    to: "pho-vietnamese",
    relationType: "regional-cousin",
    reason: "Both clear-broth soups of the East and Southeast Asian seaboard",
    strength: 4,
  },
  {
    from: "gado-gado",
    to: "nasi-campur-bali",
    relationType: "shared-method",
    reason: "Both built around a peanut sauce dressed at the table",
    strength: 4,
  },
  {
    from: "gado-gado",
    to: "hummus",
    relationType: "similar-serving",
    reason:
      "Both sit at the intersection of vegetables and a thick legume sauce",
    strength: 3,
  },
  {
    from: "pempek",
    to: "acaraje",
    relationType: "similar-serving",
    reason:
      "Both street foods with a fried-bean-or-fish base and a strong sauce",
    strength: 4,
  },
  {
    from: "rendang",
    to: "nasi-campur-bali",
    relationType: "family",
    reason: "Rendang is one of the classic components of nasi campur",
    strength: 5,
  },
  {
    from: "rendang",
    to: "sate-lilit",
    relationType: "family",
    reason: "Both use a coconut-milk-spice paste marinade on meat",
    strength: 4,
  },
  {
    from: "rawon",
    to: "rendang",
    relationType: "family",
    reason: "Both Indonesian spice-paste dishes of the Javanese sphere",
    strength: 4,
  },
  {
    from: "rawon",
    to: "soto-ayam",
    relationType: "family",
    reason: "Both Indonesian soups built on a turmeric-tinged spice paste",
    strength: 4,
  },
  {
    from: "sate-lilit",
    to: "shawarma",
    relationType: "family",
    reason: "Both skewered grilled meats of the spice-trade corridor",
    strength: 4,
  },

  // ─── East Asian cluster ────────────────────────────────────────────────
  {
    from: "mapo-tofu",
    to: "jiaozi",
    relationType: "shared-method",
    reason: "Both Sichuan staples sharing doubanjiang and chili oil",
    strength: 4,
  },
  {
    from: "mapo-tofu",
    to: "kimchi-jjigae",
    relationType: "regional-cousin",
    reason: "Both spicy stews of the East Asian mainland and peninsula",
    strength: 3,
  },
  {
    from: "congee",
    to: "pho-vietnamese",
    relationType: "similar-serving",
    reason: "Both comfort-food breakfast bowls of the East and SE Asian rim",
    strength: 4,
  },
  {
    from: "congee",
    to: "ramen-japanese",
    relationType: "similar-serving",
    reason:
      "Both warm, slow-cooked grain or noodle bowls eaten any time of day",
    strength: 3,
  },
  {
    from: "congee",
    to: "soto-ayam",
    relationType: "family",
    reason: "Both thin-broth rice-based dishes, Asian rice porridge family",
    strength: 4,
  },
  {
    from: "udon",
    to: "ramen-japanese",
    relationType: "family",
    reason: "Both Japanese noodle soups, udon is the thicker wheat sibling",
    strength: 5,
  },
  {
    from: "japchae",
    to: "bibimbap",
    relationType: "family",
    reason:
      "Both Korean dishes combining noodles/rice with vegetables and sesame oil",
    strength: 4,
  },
  {
    from: "japchae",
    to: "kimchi-jjigae",
    relationType: "shared-method",
    reason:
      "Both built on sesame oil and soy sauce, central to Korean home cooking",
    strength: 4,
  },
  {
    from: "japchae",
    to: "pho-vietnamese",
    relationType: "similar-serving",
    reason: "Both noodle dishes served as part of a multi-component meal",
    strength: 3,
  },

  // ─── Thai cluster ──────────────────────────────────────────────────────
  {
    from: "tom-yum",
    to: "pad-thai",
    relationType: "family",
    reason: "Both quintessential Thai dishes built on rempah",
    strength: 5,
  },
  {
    from: "khao-soi",
    to: "tom-yum",
    relationType: "family",
    reason:
      "Both Thai soups with a lemongrass-galangal base, khao-soi adds coconut",
    strength: 4,
  },
  {
    from: "khao-soi",
    to: "chicken-tikka-masala",
    relationType: "shared-method",
    reason: "Both slow-simmered in a coconut or cream spiced broth",
    strength: 3,
  },

  // ─── European cluster ──────────────────────────────────────────────────
  {
    from: "pizza-margherita",
    to: "cacio-e-pepe",
    relationType: "family",
    reason: "Both pillars of Roman-Neapolitan home cooking",
    strength: 4,
  },
  {
    from: "tiramisu",
    to: "tarte-tatin",
    relationType: "similar-serving",
    reason: "Both iconic European desserts, layered or caramelised",
    strength: 3,
  },
  {
    from: "bacalhau-a-bras",
    to: "paella-valenciana",
    relationType: "family",
    reason:
      "Both Iberian dishes built around salt cod or seafood on the Iberian peninsula",
    strength: 4,
  },
  {
    from: "risotto-alla-milanese",
    to: "jollof-rice",
    relationType: "shared-method",
    reason:
      "Both rice dishes cooked slowly with constant stirring in seasoned broth",
    strength: 3,
  },
  {
    from: "borscht",
    to: "goulash-hungarian",
    relationType: "family",
    reason: "Both Central/Eastern European paprika-and-onion comfort dishes",
    strength: 4,
  },
  {
    from: "borscht",
    to: "kimchi-jjigae",
    relationType: "shared-ingredient",
    reason: "Both fermented-vegetable-led soups, beet vs napa cabbage",
    strength: 3,
  },
  {
    from: "borscht",
    to: "rawon",
    relationType: "family",
    reason: "Both deep-coloured national soups with deep historical roots",
    strength: 3,
  },

  // ─── Middle Eastern / N African cluster ───────────────────────────────
  {
    from: "couscous",
    to: "tagine-moroccan",
    relationType: "family",
    reason: "Both Maghrebi staples, served together in Morocco and Tunisia",
    strength: 5,
  },
  {
    from: "couscous",
    to: "biryani-hyderabadi",
    relationType: "shared-method",
    reason: "Both steamed grain dishes layered with aromatic broth and meat",
    strength: 4,
  },
  {
    from: "shakshuka",
    to: "hummus",
    relationType: "family",
    reason:
      "Both Levantine brunch staples, served together across the Eastern Mediterranean",
    strength: 4,
  },
  {
    from: "shakshuka",
    to: "falafel",
    relationType: "family",
    reason: "Both core Levantine street foods, often eaten in the same meal",
    strength: 4,
  },
  {
    from: "shakshuka",
    to: "menemen",
    relationType: "family",
    reason: "Both egg-in-tomato-pepper dishes of the Eastern Mediterranean",
    strength: 5,
  },
  {
    from: "mansaf",
    to: "hummus",
    relationType: "family",
    reason: "Both Levantine cultural icons, central to hospitality",
    strength: 3,
  },
  {
    from: "mansaf",
    to: "shawarma",
    relationType: "family",
    reason: "Both cornerstone dishes of Levantine street and ceremony",
    strength: 3,
  },
  {
    from: "hummus",
    to: "falafel",
    relationType: "family",
    reason: "The hummus-falafel duo defines modern Middle Eastern street food",
    strength: 5,
  },

  // ─── Latin American / Caribbean cluster ───────────────────────────────
  {
    from: "tamales",
    to: "empanada",
    relationType: "family",
    reason: "Both filled-dough parcels of the Latin American tradition",
    strength: 4,
  },
  {
    from: "tamales",
    to: "pierogi",
    relationType: "family",
    reason:
      "Both steamed/boiled dough parcels with a savory filling, trans-Atlantic cousins",
    strength: 3,
  },
  {
    from: "ceviche-peruvian",
    to: "tostones",
    relationType: "regional-cousin",
    reason:
      "Both anchor dishes of the Caribbean rim and the northern coast of South America",
    strength: 4,
  },
  {
    from: "feijoada",
    to: "acaraje",
    relationType: "family",
    reason: "Both Brazilian national dishes with deep Afro-Brazilian roots",
    strength: 5,
  },
  {
    from: "acaraje",
    to: "pempek",
    relationType: "similar-serving",
    reason: "Both fried-bean-or-fish snacks served with a contrasting sauce",
    strength: 4,
  },
  {
    from: "empanada",
    to: "samosa",
    relationType: "family",
    reason:
      "Both filled pastry turnovers, Iberian via colonial trade to South Asia",
    strength: 3,
  },
  {
    from: "tostones",
    to: "fries",
    relationType: "similar-serving",
    reason: "Both twice-cooked starch sides served across the Americas",
    strength: 3,
  },

  // ─── Indian subcontinent cluster ──────────────────────────────────────
  {
    from: "dosa",
    to: "biryani-hyderabadi",
    relationType: "family",
    reason:
      "Both South Indian classics, dosa for breakfast and biryani for celebration",
    strength: 4,
  },
  {
    from: "dosa",
    to: "vindaloo",
    relationType: "family",
    reason: "Both coastal Indian preparations of the Konkan-Goan sphere",
    strength: 3,
  },
  {
    from: "dosa",
    to: "idli",
    relationType: "family",
    reason: "Both share a fermented rice-and-lentil batter",
    strength: 5,
  },
  {
    from: "vindaloo",
    to: "shakshuka",
    relationType: "shared-method",
    reason:
      "Both tomato-and-vinegar stews with chili heat, Goan and Levantine cousins",
    strength: 3,
  },

  // ─── Moussaka neighbours ──────────────────────────────────────────────
  // regional-cousin is the dish_relations vocabulary for neighboring-region
  // variations (the canonical replacement for dish_variants rows).
  {
    from: "moussaka-greek",
    to: "musakka-turkish",
    relationType: "regional-cousin",
    reason:
      "Turkish musakka serves fried aubergine in a tomato-pepper meat sauce without béchamel; Greek moussaka is the layered casserole with béchamel",
    strength: 5,
  },
  {
    from: "moussaka-greek",
    to: "moussaka-levant",
    relationType: "regional-cousin",
    reason:
      "Levantine moussaka uses tomato and chickpeas, the Greek version adds béchamel",
    strength: 5,
  },

  // ─── Hamburger diaspora ───────────────────────────────────────────────
  {
    from: "hamburger-american",
    to: "banh-mi",
    relationType: "family",
    reason: "Both sandwich form, banh-mi is the baguette cousin of the bun",
    strength: 3,
  },
  {
    from: "hamburger-american",
    to: "shawarma",
    relationType: "diaspora",
    reason:
      "Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants",
    strength: 2,
  },

  // ─── Sushi / ceviche (raw-acidified protein) ──────────────────────────
  {
    from: "sushi",
    to: "ceviche-peruvian",
    relationType: "shared-method",
    reason: "Both rely on acid or salt to 'cook' raw fish",
    strength: 4,
  },

  // ─── Casserole / stew near-neighbours ─────────────────────────────────
  {
    from: "boeuf-bourguignon",
    to: "goulash-hungarian",
    relationType: "family",
    reason: "Both beef braises of continental Europe with red wine or paprika",
    strength: 4,
  },
  {
    from: "tagine-moroccan",
    to: "boeuf-bourguignon",
    relationType: "shared-method",
    reason: "Both long-braised stews in a covered vessel",
    strength: 3,
  },

  // ─── Wiener Schnitzel diaspora ────────────────────────────────────────
  {
    from: "wiener-schnitzel",
    to: "cotoletta",
    relationType: "regional-cousin",
    reason:
      "Italian cotoletta alla milanese is the debated ancestor of Wiener schnitzel",
    strength: 4,
  },
  {
    from: "wiener-schnitzel",
    to: "tonkatsu",
    relationType: "diaspora",
    reason: "Tonkatsu is the Japanese adaptation of European breaded cutlets",
    strength: 4,
  },

  // ─── Shawarma / kebab global cluster ──────────────────────────────────
  {
    from: "shawarma",
    to: "döner",
    relationType: "family",
    reason: "Both vertical-spit grilled meats of the Ottoman diaspora",
    strength: 5,
  },

  // ─── Brazilian / Iberian long arc ─────────────────────────────────────
  {
    from: "feijoada",
    to: "bacon-and-cabbage",
    relationType: "regional-cousin",
    reason: "Both bean-and-pork stews, Portuguese-Atlantic cousins",
    strength: 3,
  },

  // ─── Fish-cake / fritter global family ────────────────────────────────
  {
    from: "pempek",
    to: "falafel",
    relationType: "similar-serving",
    reason: "Both deep-fried handheld snacks of Indonesia and the Levant",
    strength: 3,
  },
  {
    from: "pempek",
    to: "fish-cake",
    relationType: "family",
    reason: "Both minced-fish-and-starch cakes fried in oil",
    strength: 4,
  },

  // ─── Bread family: pizza / focaccia / pita ────────────────────────────
  {
    from: "pizza-margherita",
    to: "focaccia",
    relationType: "family",
    reason: "Both flat Italian breads, pizza adds tomato topping",
    strength: 4,
  },
  {
    from: "pizza-margherita",
    to: "pita",
    relationType: "family",
    reason: "Both flatbreads of the Mediterranean basin, oven-baked",
    strength: 3,
  },

  // ─── Misc diaspora / method edges to strengthen the network ────────────
  {
    from: "biryani-hyderabadi",
    to: "nasi-goreng",
    relationType: "family",
    reason: "Both layered or fried rice dishes of Muslim-majority regions",
    strength: 3,
  },
  {
    from: "khao-soi",
    to: "curry",
    relationType: "family",
    reason: "Khao soi is a curry-style noodle soup of the Chiang Mai region",
    strength: 4,
  },
  {
    from: "udon",
    to: "soba",
    relationType: "family",
    reason:
      "Both Japanese noodle families, the canonical wheat-vs-buckwheat pair",
    strength: 4,
  },
  {
    from: "congee",
    to: "risotto-alla-milanese",
    relationType: "family",
    reason:
      "Both slow-stirred rice dishes that release starch for a creamy texture",
    strength: 4,
  },
  {
    from: "babi-guling",
    to: "lechon",
    relationType: "family",
    reason: "Both spit-roasted whole pigs of Southeast Asia",
    strength: 5,
  },
  {
    from: "sate-lilit",
    to: "kofta",
    relationType: "family",
    reason: "Both minced-meat preparations formed around a skewer or spit",
    strength: 4,
  },
  {
    from: "momo",
    to: "samosa",
    relationType: "family",
    reason:
      "Both hand-held filled dough pockets of the South Asian / Himalayan rim",
    strength: 4,
  },
  {
    from: "mapo-tofu",
    to: "shakshuka",
    relationType: "shared-method",
    reason:
      "Both tofu/egg dishes simmered in a chili-flecked tomato-pepper sauce",
    strength: 3,
  },
  {
    from: "congee",
    to: "porridge",
    relationType: "family",
    reason: "Both warm grain porridges eaten at breakfast across continents",
    strength: 5,
  },
  {
    from: "tostones",
    to: "patacones",
    relationType: "family",
    reason: "Same twice-fried green-plantain dish, Caribbean vs Colombian name",
    strength: 5,
  },
  {
    from: "empanada",
    to: "samosa",
    relationType: "family",
    reason:
      "Both stuffed pastries, empanada Iberian and samosa Central Asian/South Asian",
    strength: 4,
  },
  {
    from: "acaraje",
    to: "vada",
    relationType: "family",
    reason:
      "Both deep-fried legume fritters of Afro-Brazilian and South Indian cuisines",
    strength: 4,
  },
  {
    from: "tamales",
    to: "humita",
    relationType: "family",
    reason:
      "Both Mesoamerican corn-based parcels, tamales in dough, humitas looser",
    strength: 4,
  },
  {
    from: "couscous",
    to: "bulgur",
    relationType: "family",
    reason: "Both processed-wheat staples of the Eastern Mediterranean",
    strength: 4,
  },
  {
    from: "mansaf",
    to: "lamb-and-rice",
    relationType: "family",
    reason: "Both lamb-and-rice combinations of pastoral cuisines",
    strength: 3,
  },

  // ─── Sambal / chili condiment cluster ──────────────────────────────────
  {
    from: "rendang",
    to: "sambal",
    relationType: "shared-ingredient",
    reason:
      "Both rely on a chili paste, rendang inside the dish, sambal as table condiment",
    strength: 3,
  },
  {
    from: "soto-ayam",
    to: "sambal",
    relationType: "shared-ingredient",
    reason: "Soto is incomplete without a dollop of sambal on the side",
    strength: 4,
  },

  // ─── Preserved seafood / umami cluster ────────────────────────────────
  {
    from: "bacalhau-a-bras",
    to: "ikan-bakar",
    relationType: "family",
    reason: "Both salt-cured or grilled fish dishes of maritime cuisines",
    strength: 3,
  },
  {
    from: "ceviche-peruvian",
    to: "poke",
    relationType: "diaspora",
    reason:
      "Hawaiian poke is the Pacific diaspora cousin of ceviche-style raw fish",
    strength: 3,
  },

  // ─── Bridging gaps: a few more 5-strength canonical anchors ───────────
  {
    from: "pho-vietnamese",
    to: "khao-soi",
    relationType: "family",
    reason:
      "Both Southeast/East Asian noodle soups in the broth-and-protein family",
    strength: 5,
  },
  {
    from: "hummus",
    to: "baba-ganoush",
    relationType: "family",
    reason: "Both Levantine dips at the heart of the meze table",
    strength: 5,
  },
  {
    from: "tom-yum",
    to: "laksa",
    relationType: "family",
    reason: "Both tom-yum-derived broths, Thai vs Peranakan",
    strength: 4,
  },
  {
    from: "paella-valenciana",
    to: "jollof-rice",
    relationType: "family",
    reason:
      "Both saffron-tinted rice dishes of the Atlantic world, paella vs jollof",
    strength: 3,
  },
];
