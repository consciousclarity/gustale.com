/**
 * Curated seed dataset for Gustale.
 *
 * Each entry is a complete dish record ready to seed into the database:
 *  - canonical name, slug, short + long description
 *  - origin (lat/lng + country/region entity)
 *  - cuisine category + 1-3 dish-type categories (slug keys only)
 *  - one Wikipedia source URL (the canonical encyclopedia citation)
 *
 * Source of truth for content: Wikipedia (English). The seeder inserts a
 * `sources` row per dish + a `citations` row pointing at the description,
 * so every claim on the live site has an audit trail.
 *
 * To add more dishes: append to DISHES below. The seeder is idempotent —
 * re-running with the same slug is a no-op.
 */

export type DishTypeSlug =
  | "pasta" | "noodle-soup" | "stew" | "fried-rice" | "sandwich"
  | "soup" | "curry" | "stir-fry" | "salad" | "pancake"
  | "dumpling" | "kebab" | "bread" | "sauce" | "dessert"
  | "rice-dish" | "casserole" | "appetizer" | "main-course";

export interface SeedDish {
  slug: string;
  canonicalName: string;
  shortDescription: string;
  longDescription?: string;
  lat: number;
  lng: number;
  countryName: string;
  isoCode: string;        // ISO 3166-1 alpha-2
  cuisineSlug: string;    // e.g. "italian-cuisine"
  dishTypes: DishTypeSlug[];
  wikipediaSlug: string;  // for source URL construction
  originDateEarliest?: number;
  originDateLatest?: number;
}

export const DISHES: SeedDish[] = [
  // ─── Europe ────────────────────────────────────────────────────────────
  {
    slug: "moussaka-greek",
    canonicalName: "Moussaka",
    shortDescription: "A layered casserole of fried eggplant, spiced minced meat, and béchamel sauce, baked until golden. Considered the national dish of Greece.",
    lat: 39.0742, lng: 21.8243,
    countryName: "Greece", isoCode: "GR",
    cuisineSlug: "greek-cuisine",
    dishTypes: ["casserole", "main-course"],
    wikipediaSlug: "Moussaka",
    originDateEarliest: 1920, originDateLatest: 1950,
  },
  {
    slug: "cacio-e-pepe",
    canonicalName: "Cacio e pepe",
    shortDescription: "A Roman pasta made with just Pecorino Romano cheese and freshly ground black pepper tossed with hot pasta water and tonnarelli or spaghetti.",
    lat: 41.9028, lng: 12.4964,
    countryName: "Italy", isoCode: "IT",
    cuisineSlug: "italian-cuisine",
    dishTypes: ["pasta", "main-course"],
    wikipediaSlug: "Cacio_e_pepe",
  },
  {
    slug: "pizza-margherita",
    canonicalName: "Pizza Margherita",
    shortDescription: "A Neapolitan pizza topped with San Marzano tomato sauce, fresh mozzarella, fresh basil, and olive oil. Named for Queen Margherita of Savoy in 1889.",
    lat: 40.8518, lng: 14.2681,
    countryName: "Italy", isoCode: "IT",
    cuisineSlug: "italian-cuisine",
    dishTypes: ["bread", "main-course"],
    wikipediaSlug: "Pizza_Margherita",
    originDateEarliest: 1889, originDateLatest: 1889,
  },
  {
    slug: "paella-valenciana",
    canonicalName: "Paella",
    shortDescription: "A Valencian rice dish with saffron, olive oil, vegetables, and a choice of seafood, meat, or beans. Cooked in a wide, shallow pan over an open fire.",
    lat: 39.4699, lng: -0.3763,
    countryName: "Spain", isoCode: "ES",
    cuisineSlug: "spanish-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Paella",
  },
  {
    slug: "gazpacho",
    canonicalName: "Gazpacho",
    shortDescription: "A cold Andalusian soup made from raw blended vegetables — typically tomato, cucumber, pepper, garlic, olive oil, vinegar, and stale bread.",
    lat: 37.3891, lng: -5.9845,
    countryName: "Spain", isoCode: "ES",
    cuisineSlug: "spanish-cuisine",
    dishTypes: ["soup", "appetizer"],
    wikipediaSlug: "Gazpacho",
  },
  {
    slug: "tarte-tatin",
    canonicalName: "Tarte Tatin",
    shortDescription: "An upside-down French tart in which apples are caramelised in butter and sugar beneath a pastry crust, then flipped when served.",
    lat: 47.9025, lng: 1.9090,
    countryName: "France", isoCode: "FR",
    cuisineSlug: "french-cuisine",
    dishTypes: ["dessert"],
    wikipediaSlug: "Tarte_Tatin",
    originDateEarliest: 1880, originDateLatest: 1900,
  },
  {
    slug: "boeuf-bourguignon",
    canonicalName: "Boeuf bourguignon",
    shortDescription: "A French beef stew braised in red wine (traditionally Burgundy) with beef broth, bacon, onions, mushrooms, and a bouquet garni.",
    lat: 47.2805, lng: 4.9994,
    countryName: "France", isoCode: "FR",
    cuisineSlug: "french-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Boeuf_bourguignon",
  },
  {
    slug: "wiener-schnitzel",
    canonicalName: "Wiener Schnitzel",
    shortDescription: "A thin, breaded, pan-fried veal cutlet, traditionally served in Austria with a slice of lemon and either potato salad or parsley potatoes.",
    lat: 48.2082, lng: 16.3738,
    countryName: "Austria", isoCode: "AT",
    cuisineSlug: "austrian-cuisine",
    dishTypes: ["main-course"],
    wikipediaSlug: "Wiener_Schnitzel",
  },
  {
    slug: "pierogi",
    canonicalName: "Pierogi",
    shortDescription: "Filled dumplings of unleavened dough, traditionally stuffed with potato, sauerkraut, meat, cheese, or fruit. A staple of Polish cuisine.",
    lat: 52.2297, lng: 21.0122,
    countryName: "Poland", isoCode: "PL",
    cuisineSlug: "polish-cuisine",
    dishTypes: ["dumpling", "main-course"],
    wikipediaSlug: "Pierogi",
  },
  {
    slug: "goulash-hungarian",
    canonicalName: "Goulash",
    shortDescription: "A Hungarian soup or stew of meat and vegetables seasoned with paprika and other spices. The name derives from the Hungarian word gulyás, meaning 'herdsman'.",
    lat: 47.4979, lng: 19.0402,
    countryName: "Hungary", isoCode: "HU",
    cuisineSlug: "hungarian-cuisine",
    dishTypes: ["stew", "soup", "main-course"],
    wikipediaSlug: "Goulash",
  },

  // ─── East & Southeast Asia ────────────────────────────────────────────
  {
    slug: "ramen-japanese",
    canonicalName: "Ramen",
    shortDescription: "A Japanese noodle soup with wheat noodles in a meat- or fish-based broth, flavoured with soy sauce or miso and topped with ingredients like sliced pork, nori, and scallions.",
    lat: 35.6762, lng: 139.6503,
    countryName: "Japan", isoCode: "JP",
    cuisineSlug: "japanese-cuisine",
    dishTypes: ["noodle-soup", "main-course"],
    wikipediaSlug: "Ramen",
  },
  {
    slug: "sushi",
    canonicalName: "Sushi",
    shortDescription: "A traditional Japanese dish of vinegared rice paired with various ingredients, most commonly raw seafood, vegetables, and sometimes tropical fruits.",
    lat: 35.6762, lng: 139.6503,
    countryName: "Japan", isoCode: "JP",
    cuisineSlug: "japanese-cuisine",
    dishTypes: ["main-course"],
    wikipediaSlug: "Sushi",
  },
  {
    slug: "pad-thai",
    canonicalName: "Pad Thai",
    shortDescription: "A stir-fried rice noodle dish from Thailand with eggs, vegetables, tofu or shrimp, peanuts, and a tangy sauce of tamarind, fish sauce, and palm sugar.",
    lat: 13.7563, lng: 100.5018,
    countryName: "Thailand", isoCode: "TH",
    cuisineSlug: "thai-cuisine",
    dishTypes: ["stir-fry", "noodle-soup", "main-course"],
    wikipediaSlug: "Pad_Thai",
    originDateEarliest: 1930, originDateLatest: 1940,
  },
  {
    slug: "tom-yum",
    canonicalName: "Tom Yum",
    shortDescription: "A hot and sour Thai soup with shrimp, lemongrass, kaffir lime leaves, galangal, lime juice, fish sauce, and crushed chili peppers.",
    lat: 13.7563, lng: 100.5018,
    countryName: "Thailand", isoCode: "TH",
    cuisineSlug: "thai-cuisine",
    dishTypes: ["soup", "main-course"],
    wikipediaSlug: "Tom_yum",
  },
  {
    slug: "pho-vietnamese",
    canonicalName: "Phở",
    shortDescription: "A Vietnamese noodle soup of bone broth, rice noodles, herbs, and meat (typically beef or chicken). Considered Vietnam's national dish.",
    lat: 21.0285, lng: 105.8542,
    countryName: "Vietnam", isoCode: "VN",
    cuisineSlug: "vietnamese-cuisine",
    dishTypes: ["noodle-soup", "main-course"],
    wikipediaSlug: "Ph%E1%BB%9F",
    originDateEarliest: 1900, originDateLatest: 1920,
  },
  {
    slug: "banh-mi",
    canonicalName: "Bánh mì",
    shortDescription: "A Vietnamese sandwich of a short baguette with grilled pork, pâté, pickled vegetables, fresh herbs, and chili. A legacy of French colonial rule.",
    lat: 21.0285, lng: 105.8542,
    countryName: "Vietnam", isoCode: "VN",
    cuisineSlug: "vietnamese-cuisine",
    dishTypes: ["sandwich", "main-course"],
    wikipediaSlug: "B%C3%A1nh_m%C3%AC",
    originDateEarliest: 1890, originDateLatest: 1910,
  },
  {
    slug: "hainanese-chicken-rice",
    canonicalName: "Hainanese Chicken Rice",
    shortDescription: "A dish of poached chicken served with seasoned rice cooked in chicken broth, accompanied by cucumber, chili sauce, and ginger paste.",
    lat: 1.3521, lng: 103.8198,
    countryName: "Singapore", isoCode: "SG",
    cuisineSlug: "singaporean-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Hainanese_chicken_rice",
  },
  {
    slug: "nasi-goreng",
    canonicalName: "Nasi Goreng",
    shortDescription: "An Indonesian fried rice dish cooked with kecap manis (sweet soy sauce), shallots, garlic, tamarind, and chilli, typically topped with a fried egg.",
    lat: -6.2088, lng: 106.8456,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["fried-rice", "main-course"],
    wikipediaSlug: "Nasi_goreng",
  },
  {
    slug: "bibimbap",
    canonicalName: "Bibimbap",
    shortDescription: "A Korean rice dish of steamed white rice topped with sautéed and seasoned vegetables, beef, a raw or fried egg, and gochujang (chilli paste).",
    lat: 37.5665, lng: 126.9780,
    countryName: "South Korea", isoCode: "KR",
    cuisineSlug: "korean-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Bibimbap",
  },
  {
    slug: "kimchi-jjigae",
    canonicalName: "Kimchi Jjigae",
    shortDescription: "A Korean stew made with aged kimchi, pork or tuna, tofu, scallions, and gochujang, simmered together until bubbling and tangy.",
    lat: 37.5665, lng: 126.9780,
    countryName: "South Korea", isoCode: "KR",
    cuisineSlug: "korean-cuisine",
    dishTypes: ["stew", "soup", "main-course"],
    wikipediaSlug: "Kimchi_jjigae",
  },

  // ─── Middle East & South Asia ─────────────────────────────────────────
  {
    slug: "hummus",
    canonicalName: "Hummus",
    shortDescription: "A Levantine dip or spread made from cooked, mashed chickpeas blended with tahini, lemon juice, garlic, and olive oil.",
    lat: 31.7683, lng: 35.2137,
    countryName: "Israel", isoCode: "IL",
    cuisineSlug: "israeli-cuisine",
    dishTypes: ["appetizer", "sauce"],
    wikipediaSlug: "Hummus",
  },
  {
    slug: "falafel",
    canonicalName: "Falafel",
    shortDescription: "Deep-fried balls or patties of ground chickpeas, fava beans, or both, mixed with herbs and spices. A staple of Middle Eastern street food.",
    lat: 31.7683, lng: 35.2137,
    countryName: "Israel", isoCode: "IL",
    cuisineSlug: "israeli-cuisine",
    dishTypes: ["appetizer", "main-course"],
    wikipediaSlug: "Falafel",
  },
  {
    slug: "shawarma",
    canonicalName: "Shawarma",
    shortDescription: "A Middle Eastern dish of slow-roasted, thinly sliced meat (lamb, mutton, beef, chicken, or mixed) served in a flatbread with vegetables and tahini or yogurt sauce.",
    lat: 33.8938, lng: 35.5018,
    countryName: "Lebanon", isoCode: "LB",
    cuisineSlug: "lebanese-cuisine",
    dishTypes: ["sandwich", "main-course"],
    wikipediaSlug: "Shawarma",
  },
  {
    slug: "biryani-hyderabadi",
    canonicalName: "Hyderabadi Biryani",
    shortDescription: "A mixed rice dish of layered basmati rice, marinated meat (typically chicken, mutton, or goat), fried onions, saffron, and whole spices. The Hyderabadi version is among the most famous.",
    lat: 17.3850, lng: 78.4867,
    countryName: "India", isoCode: "IN",
    cuisineSlug: "indian-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Biryani",
  },
  {
    slug: "chicken-tikka-masala",
    canonicalName: "Chicken Tikka Masala",
    shortDescription: "A dish of roasted marinated chicken chunks (chicken tikka) in a spiced, creamy tomato sauce. Often considered a British national dish due to its invention in Glasgow.",
    lat: 55.8642, lng: -4.2518,
    countryName: "United Kingdom", isoCode: "GB",
    cuisineSlug: "british-cuisine",
    dishTypes: ["curry", "main-course"],
    wikipediaSlug: "Chicken_tikka_masala",
    originDateEarliest: 1960, originDateLatest: 1970,
  },

  // ─── Americas ──────────────────────────────────────────────────────────
  {
    slug: "feijoada",
    canonicalName: "Feijoada",
    shortDescription: "A Brazilian stew of black beans with pork and beef, served with rice, collard greens, farofa (toasted cassava flour), and orange slices.",
    lat: -22.9068, lng: -43.1729,
    countryName: "Brazil", isoCode: "BR",
    cuisineSlug: "brazilian-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Feijoada",
  },
  {
    slug: "ceviche-peruvian",
    canonicalName: "Ceviche",
    shortDescription: "A Peruvian dish of raw fish cured in fresh citrus juices (typically lime), spiced with ají or chili peppers, and seasoned with onions, salt, and cilantro.",
    lat: -12.0464, lng: -77.0428,
    countryName: "Peru", isoCode: "PE",
    cuisineSlug: "peruvian-cuisine",
    dishTypes: ["appetizer", "main-course"],
    wikipediaSlug: "Ceviche",
  },
  {
    slug: "hamburger-american",
    canonicalName: "Hamburger",
    shortDescription: "A sandwich consisting of a cooked ground-meat patty (usually beef) between two pieces of bread or a bun. The modern form is most associated with the United States.",
    lat: 39.8283, lng: -98.5795,
    countryName: "United States", isoCode: "US",
    cuisineSlug: "american-cuisine",
    dishTypes: ["sandwich", "main-course"],
    wikipediaSlug: "Hamburger",
  },
  {
    slug: "poutine",
    canonicalName: "Poutine",
    shortDescription: "A Québécois dish of french fries topped with cheese curds and hot gravy. Originated in rural Quebec in the 1950s.",
    lat: 46.8139, lng: -71.2080,
    countryName: "Canada", isoCode: "CA",
    cuisineSlug: "canadian-cuisine",
    dishTypes: ["main-course"],
    wikipediaSlug: "Poutine",
    originDateEarliest: 1950, originDateLatest: 1960,
  },

  // ─── Africa ────────────────────────────────────────────────────────────
  {
    slug: "tagine-moroccan",
    canonicalName: "Tagine",
    shortDescription: "A slow-cooked North African stew named after the conical clay pot in which it is cooked. Combines meat (typically lamb or chicken) with vegetables, fruits, and warming spices.",
    lat: 33.9716, lng: -6.8498,
    countryName: "Morocco", isoCode: "MA",
    cuisineSlug: "moroccan-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Tagine",
  },
  {
    slug: "jollof-rice",
    canonicalName: "Jollof Rice",
    shortDescription: "A West African one-pot rice dish of long-grain rice simmered in a tomato-and-red-pepper sauce with onions, garlic, ginger, thyme, and assorted proteins.",
    lat: 6.5244, lng: 3.3792,
    countryName: "Nigeria", isoCode: "NG",
    cuisineSlug: "nigerian-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Jollof_rice",
  },
];

/**
 * National-cuisine categories (one per dish's country of origin).
 * `slug` is the lookup key; `name` is the human-readable label.
 */
export const CUISINE_CATEGORIES: Array<{ slug: string; name: string; description: string }> = [
  { slug: "greek-cuisine",      name: "Greek cuisine",      description: "Cuisine of Greece" },
  { slug: "italian-cuisine",    name: "Italian cuisine",    description: "Cuisine of Italy" },
  { slug: "spanish-cuisine",    name: "Spanish cuisine",    description: "Cuisine of Spain" },
  { slug: "french-cuisine",     name: "French cuisine",     description: "Cuisine of France" },
  { slug: "austrian-cuisine",   name: "Austrian cuisine",   description: "Cuisine of Austria" },
  { slug: "polish-cuisine",     name: "Polish cuisine",     description: "Cuisine of Poland" },
  { slug: "hungarian-cuisine",  name: "Hungarian cuisine",  description: "Cuisine of Hungary" },
  { slug: "japanese-cuisine",   name: "Japanese cuisine",   description: "Cuisine of Japan" },
  { slug: "thai-cuisine",       name: "Thai cuisine",       description: "Cuisine of Thailand" },
  { slug: "vietnamese-cuisine", name: "Vietnamese cuisine", description: "Cuisine of Vietnam" },
  { slug: "singaporean-cuisine",name: "Singaporean cuisine",description: "Cuisine of Singapore" },
  { slug: "indonesian-cuisine", name: "Indonesian cuisine", description: "Cuisine of Indonesia" },
  { slug: "korean-cuisine",     name: "Korean cuisine",     description: "Cuisine of South Korea" },
  { slug: "israeli-cuisine",    name: "Israeli cuisine",    description: "Cuisine of Israel" },
  { slug: "lebanese-cuisine",   name: "Lebanese cuisine",   description: "Cuisine of Lebanon" },
  { slug: "indian-cuisine",     name: "Indian cuisine",     description: "Cuisine of India" },
  { slug: "british-cuisine",    name: "British cuisine",    description: "Cuisine of the United Kingdom" },
  { slug: "brazilian-cuisine",  name: "Brazilian cuisine",  description: "Cuisine of Brazil" },
  { slug: "peruvian-cuisine",   name: "Peruvian cuisine",   description: "Cuisine of Peru" },
  { slug: "american-cuisine",   name: "American cuisine",   description: "Cuisine of the United States" },
  { slug: "canadian-cuisine",   name: "Canadian cuisine",   description: "Cuisine of Canada" },
  { slug: "moroccan-cuisine",   name: "Moroccan cuisine",   description: "Cuisine of Morocco" },
  { slug: "nigerian-cuisine",   name: "Nigerian cuisine",   description: "Cuisine of Nigeria" },
];

/**
 * Dish-type categories — taxonomic labels independent of cuisine.
 * Used to power the /dishes filter (e.g. "show me all stews").
 */
export const DISH_TYPE_CATEGORIES: Array<{ slug: string; name: string; description: string }> = [
  { slug: "pasta",         name: "Pasta",         description: "Italian-style noodle dishes" },
  { slug: "noodle-soup",   name: "Noodle soup",   description: "Broth-based noodle dishes (ramen, pho, etc.)" },
  { slug: "stew",          name: "Stew",          description: "Slow-cooked dishes in liquid" },
  { slug: "fried-rice",    name: "Fried rice",    description: "Stir-fried rice dishes" },
  { slug: "rice-dish",     name: "Rice dish",     description: "Rice as the primary base" },
  { slug: "sandwich",      name: "Sandwich",      description: "Fillings served between bread or in a roll" },
  { slug: "soup",          name: "Soup",          description: "Hot or cold liquid dishes" },
  { slug: "curry",         name: "Curry",         description: "Spiced sauce-based dishes" },
  { slug: "stir-fry",      name: "Stir-fry",      description: "Quick-cooked ingredients tossed over high heat" },
  { slug: "salad",         name: "Salad",         description: "Cold, raw or lightly cooked vegetable dishes" },
  { slug: "pancake",       name: "Pancake",       description: "Flat griddled batter cakes" },
  { slug: "dumpling",      name: "Dumpling",      description: "Filled dough parcels (boiled, steamed, fried)" },
  { slug: "kebab",         name: "Kebab",         description: "Skewered and grilled meat or vegetables" },
  { slug: "bread",         name: "Bread",         description: "Baked dough, including flatbreads and focaccia-style" },
  { slug: "sauce",         name: "Sauce",         description: "Condiments or accompaniments" },
  { slug: "dessert",       name: "Dessert",       description: "Sweet final courses" },
  { slug: "casserole",     name: "Casserole",     description: "Layered and baked dishes" },
  { slug: "appetizer",     name: "Appetizer",     description: "Small opening courses or snacks" },
  { slug: "main-course",   name: "Main course",   description: "Substantial primary plate" },
];