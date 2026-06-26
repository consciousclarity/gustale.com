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
  | "rice-dish" | "casserole" | "appetizer" | "main-course"
  // Network expansion — added with the food-network knowledge map pass.
  // `side` for plantain-side / bread-side dishes; `street-snack` for
  // handheld market foods (acarajé, pempek). `fermented` is reserved for
  // future kimchi-style primary-ingredient dishes.
  | "side" | "street-snack" | "fermented";

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

  // ─── Southeast Asia — Indonesia & Bali ────────────────────────────────
  {
    slug: "babi-guling",
    canonicalName: "Babi Guling",
    shortDescription: "A Balinese whole-roasted suckling pig stuffed with a spice paste of turmeric, coriander, galangal, garlic, and chili, spit-roasted over coconut husk fire until the skin crackles.",
    lat: -8.4095, lng: 115.1889,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["main-course", "kebab"],
    wikipediaSlug: "Babi_guling",
  },
  {
    slug: "rendang",
    canonicalName: "Rendang",
    shortDescription: "A West Sumatran dry curry of beef slow-cooked for hours in coconut milk and a paste of ginger, galangal, turmeric, chili, lemongrass, garlic, and shallots until the sauce fully reduces and the meat darkens.",
    lat: -0.7893, lng: 100.6544,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["curry", "stew", "main-course"],
    wikipediaSlug: "Rendang",
  },
  {
    slug: "soto-ayam",
    canonicalName: "Soto Ayam",
    shortDescription: "An Indonesian clear chicken soup fragrant with turmeric, lemongrass, and lime leaves, served with rice or vermicelli, shredded chicken, boiled egg, bean sprouts, and crispy shallots.",
    lat: -6.2088, lng: 106.8456,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["soup", "main-course"],
    wikipediaSlug: "Soto_ayam",
  },
  {
    slug: "rawon",
    canonicalName: "Rawon",
    shortDescription: "An East Javanese beef soup with a deep black color from keluak nuts, seasoned with garlic, shallots, ginger, turmeric, and aromatic leaves.",
    lat: -7.2459, lng: 112.7378,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["soup", "main-course"],
    wikipediaSlug: "Rawon",
  },
  {
    slug: "gado-gado",
    canonicalName: "Gado-Gado",
    shortDescription: "An Indonesian salad of blanched and steamed vegetables, hard-boiled egg, fried tofu, and lontong, dressed in a peanut sauce sweetened with palm sugar and spiked with chili and tamarind.",
    lat: -6.1751, lng: 106.8650,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["salad", "main-course"],
    wikipediaSlug: "Gado-gado",
  },
  {
    slug: "pempek",
    canonicalName: "Pempek",
    shortDescription: "Palembang fish cakes made from ground mackerel or other white fish mixed with tapioca flour, formed into logs or balls, boiled, sliced, and fried, served with a sweet-sour-spicy cuko sauce.",
    lat: -2.9909, lng: 104.7567,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["appetizer", "main-course"],
    wikipediaSlug: "Pempek",
  },
  {
    slug: "nasi-campur-bali",
    canonicalName: "Nasi Campur Bali",
    shortDescription: "A Balinese rice plate featuring a small mound of white rice surrounded by several small portions: a meat or fish, vegetables, peanut sauce, fried shallots, shredded coconut, sambal, and a small portion of lawar.",
    lat: -8.6500, lng: 115.2167,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Nasi_campur",
  },
  {
    slug: "sate-lilit",
    canonicalName: "Sate Lilit",
    shortDescription: "A Balinese minced-meat satay: finely ground pork, chicken, or fish mixed with grated coconut, coconut milk, lime leaves, lemongrass, and spices, molded around bamboo skewers and grilled over coconut charcoal.",
    lat: -8.5069, lng: 115.2625,
    countryName: "Indonesia", isoCode: "ID",
    cuisineSlug: "indonesian-cuisine",
    dishTypes: ["kebab", "appetizer"],
    wikipediaSlug: "Sate_lilit",
  },

  // ─── Southeast Asia — broader ─────────────────────────────────────────
  {
    slug: "laksa",
    canonicalName: "Laksa",
    shortDescription: "A spicy noodle soup of Peranakan and broader Southeast Asian origin: rice vermicelli or thick wheat noodles in a fragrant broth built from lemongrass, galangal, candlenuts, turmeric, and dried shrimp, topped with bean sprouts, prawns, and hard-boiled egg.",
    lat: 1.3521, lng: 103.8198,
    countryName: "Singapore", isoCode: "SG",
    cuisineSlug: "singaporean-cuisine",
    dishTypes: ["noodle-soup", "soup", "main-course"],
    wikipediaSlug: "Laksa",
  },
  {
    slug: "khao-soi",
    canonicalName: "Khao Soi",
    shortDescription: "A Northern Thai coconut-curry noodle soup of soft egg noodles in a turmeric-and-chili coconut broth, topped with crispy fried noodles, chicken or beef, pickled mustard greens, shallots, and lime.",
    lat: 18.7883, lng: 98.9853,
    countryName: "Thailand", isoCode: "TH",
    cuisineSlug: "northern-thai-cuisine",
    dishTypes: ["noodle-soup", "curry", "main-course"],
    wikipediaSlug: "Khao_soi",
  },

  // ─── East Asia ─────────────────────────────────────────────────────────
  {
    slug: "udon",
    canonicalName: "Udon",
    shortDescription: "Thick Japanese wheat noodles served in a light dashi-based broth, often with toppings such as tempura, sliced scallion, or a soft-boiled egg. Related to ramen but chewier and usually served in a milder broth.",
    lat: 34.6937, lng: 135.5023,
    countryName: "Japan", isoCode: "JP",
    cuisineSlug: "japanese-cuisine",
    dishTypes: ["noodle-soup", "main-course"],
    wikipediaSlug: "Udon",
  },
  {
    slug: "mapo-tofu",
    canonicalName: "Mapo Tofu",
    shortDescription: "A Sichuan dish of silken tofu simmered in a fiery red sauce of fermented broad-bean paste (doubanjiang), ground pork or beef, douchi, Sichuan peppercorns, chili oil, and scallions.",
    lat: 30.5728, lng: 104.0668,
    countryName: "China", isoCode: "CN",
    cuisineSlug: "chinese-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Mapo_tofu",
  },
  {
    slug: "congee",
    canonicalName: "Congee",
    shortDescription: "A long-simmered rice porridge eaten across East and Southeast Asia, served plain or with pickles, century egg, shredded pork, fish, or scallions. Cantonese jook, Japanese okayu, and Indonesian bubur are all forms.",
    lat: 23.1291, lng: 113.2644,
    countryName: "China", isoCode: "CN",
    cuisineSlug: "chinese-cuisine",
    dishTypes: ["soup", "main-course"],
    wikipediaSlug: "Congee",
  },
  {
    slug: "jiaozi",
    canonicalName: "Jiaozi",
    shortDescription: "Northern Chinese crescent-shaped dumplings with a thin wheat-flour wrapper and a filling of ground pork, cabbage, ginger, scallions, and soy sauce. Boiled (shuijiao), steamed (zhengjiao), or pan-fried (guotie).",
    lat: 39.9042, lng: 116.4074,
    countryName: "China", isoCode: "CN",
    cuisineSlug: "chinese-cuisine",
    dishTypes: ["dumpling", "main-course"],
    wikipediaSlug: "Jiaozi",
  },
  {
    slug: "japchae",
    canonicalName: "Japchae",
    shortDescription: "A Korean stir-fried glass-noodle dish made from sweet-potato starch noodles tossed with beef, spinach, mushrooms, carrots, and onion in a sesame-oil and soy sauce dressing.",
    lat: 37.5665, lng: 126.9780,
    countryName: "South Korea", isoCode: "KR",
    cuisineSlug: "korean-cuisine",
    dishTypes: ["stir-fry", "noodle-soup", "main-course"],
    wikipediaSlug: "Japchae",
  },

  // ─── South / Central Asia ──────────────────────────────────────────────
  {
    slug: "dosa",
    canonicalName: "Dosa",
    shortDescription: "A thin, crispy South Indian crepe made from a fermented batter of rice and urad dal, served with coconut chutney and sambar. Sambar is closely related to the rasam and other lentil-stew traditions of the Deccan.",
    lat: 13.0827, lng: 80.2707,
    countryName: "India", isoCode: "IN",
    cuisineSlug: "south-indian-cuisine",
    dishTypes: ["pancake", "main-course"],
    wikipediaSlug: "Dosa",
  },
  {
    slug: "vindaloo",
    canonicalName: "Vindaloo",
    shortDescription: "A Goan curry of Portuguese origin: meat (traditionally pork) marinated in vinegar, garlic, and Kashmiri chili, then cooked with onions, ginger, and warm spices. The Portuguese carne de vinha d'alhos became vindaloo over centuries.",
    lat: 15.2993, lng: 74.1240,
    countryName: "India", isoCode: "IN",
    cuisineSlug: "goan-cuisine",
    dishTypes: ["curry", "main-course"],
    wikipediaSlug: "Vindaloo",
  },
  {
    slug: "momo",
    canonicalName: "Momo",
    shortDescription: "A Himalayan steamed dumpling of Tibetan origin, made from a thin wheat-flour wrapper and a filling of ground meat or vegetables. Now widely eaten across Nepal, Sikkim, Bhutan, and the Tibetan diaspora.",
    lat: 27.7172, lng: 85.3240,
    countryName: "Nepal", isoCode: "NP",
    cuisineSlug: "nepali-cuisine",
    dishTypes: ["dumpling", "appetizer"],
    wikipediaSlug: "Momo_(dumpling)",
  },

  // ─── Europe ────────────────────────────────────────────────────────────
  {
    slug: "risotto-alla-milanese",
    canonicalName: "Risotto alla Milanese",
    shortDescription: "A Northern Italian short-grain rice dish cooked in a bone-marrow-enriched beef broth with saffron and onions, giving it a deep yellow color and a faintly metallic, floral finish.",
    lat: 45.4642, lng: 9.1900,
    countryName: "Italy", isoCode: "IT",
    cuisineSlug: "italian-cuisine",
    dishTypes: ["rice-dish", "main-course"],
    wikipediaSlug: "Risotto_alla_milanese",
  },
  {
    slug: "couscous",
    canonicalName: "Couscous",
    shortDescription: "Tiny steamed semolina grains of Maghrebi origin, served beneath or alongside a stew of meat (typically lamb or chicken) and vegetables flavored with ras el hanout, saffron, and preserved lemon.",
    lat: 36.8065, lng: 10.1815,
    countryName: "Tunisia", isoCode: "TN",
    cuisineSlug: "maghrebi-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Couscous",
  },
  {
    slug: "shakshuka",
    canonicalName: "Shakshuka",
    shortDescription: "Eggs poached in a spiced sauce of tomatoes, peppers, onions, garlic, and chili. Origin disputed between North African and Levantine kitchens; eaten across Israel, Tunisia, Libya, and the Maghreb.",
    lat: 32.0853, lng: 34.7818,
    countryName: "Israel", isoCode: "IL",
    cuisineSlug: "israeli-cuisine",
    dishTypes: ["main-course"],
    wikipediaSlug: "Shakshuka",
  },
  {
    slug: "mansaf",
    canonicalName: "Mansaf",
    shortDescription: "The national dish of Jordan: lamb cooked in a fermented dried-yogurt sauce (jameed) and served over a flatbread (shrak) topped with rice and almonds. Central to Bedouin hospitality.",
    lat: 31.9454, lng: 35.9284,
    countryName: "Jordan", isoCode: "JO",
    cuisineSlug: "jordanian-cuisine",
    dishTypes: ["stew", "main-course"],
    wikipediaSlug: "Mansaf",
  },
  {
    slug: "borscht",
    canonicalName: "Borscht",
    shortDescription: "A sour soup of Eastern European origin built on beetroots, which give it a deep red color, combined with cabbage, potatoes, carrots, onion, and a meat broth. Often served with sour cream and pampushky.",
    lat: 50.4501, lng: 30.5234,
    countryName: "Ukraine", isoCode: "UA",
    cuisineSlug: "ukrainian-cuisine",
    dishTypes: ["soup", "main-course"],
    wikipediaSlug: "Borscht",
  },
  {
    slug: "bacalhau-a-bras",
    canonicalName: "Bacalhau à Brás",
    shortDescription: "A Portuguese dish of shredded salt cod stir-fried with onions, matchstick potatoes, parsley, olives, and eggs, finished with black olives and a squeeze of lemon.",
    lat: 38.7223, lng: -9.1393,
    countryName: "Portugal", isoCode: "PT",
    cuisineSlug: "portuguese-cuisine",
    dishTypes: ["stir-fry", "main-course"],
    wikipediaSlug: "Bacalhau_%C3%A0_Br%C3%A1s",
  },
  {
    slug: "tiramisu",
    canonicalName: "Tiramisù",
    shortDescription: "A layered Italian dessert of espresso-soaked savoiardi biscuits and a mascarpone cream, dusted with cocoa. Origins contested between Veneto and Friuli-Venezia Giulia; emerged in its modern form in the 1960s–80s.",
    lat: 45.4408, lng: 12.3155,
    countryName: "Italy", isoCode: "IT",
    cuisineSlug: "italian-cuisine",
    dishTypes: ["dessert"],
    wikipediaSlug: "Tiramis%C3%B9",
  },

  // ─── Americas ──────────────────────────────────────────────────────────
  {
    slug: "tamales",
    canonicalName: "Tamales",
    shortDescription: "Masa (nixtamalized corn dough) filled with meat, cheese, beans, or chilies, wrapped in a corn husk or banana leaf and steamed. Found across Mexico, Guatemala, and much of Central America; deeply rooted in Mesoamerican cooking.",
    lat: 19.4326, lng: -99.1332,
    countryName: "Mexico", isoCode: "MX",
    cuisineSlug: "mexican-cuisine",
    dishTypes: ["main-course", "appetizer"],
    wikipediaSlug: "Tamale",
  },
  {
    slug: "empanada",
    canonicalName: "Empanada",
    shortDescription: "A baked or fried pastry turnover filled with seasoned meat, cheese, or vegetables. Found across Latin America from Argentina to the Philippines, each region claiming its own folded style and filling.",
    lat: -34.6037, lng: -58.3816,
    countryName: "Argentina", isoCode: "AR",
    cuisineSlug: "argentine-cuisine",
    dishTypes: ["appetizer", "main-course"],
    wikipediaSlug: "Empanada",
  },
  {
    slug: "tostones",
    canonicalName: "Tostones",
    shortDescription: "Twice-fried green-plantain slices, flattened between fryings. A staple across the Caribbean and Latin American coastlines, served as a side or snack, often with garlic mojo or a saltfish topping.",
    lat: 18.4655, lng: -66.1057,
    countryName: "Puerto Rico", isoCode: "PR",
    cuisineSlug: "caribbean-cuisine",
    dishTypes: ["appetizer", "side"],
    wikipediaSlug: "Tostones",
  },
  {
    slug: "acaraje",
    canonicalName: "Acarajé",
    shortDescription: "A Bahian (Brazilian) street food of black-eyed pea fritters split open and stuffed with vatapá (a shrimp and peanut paste), dried shrimp, and a bright salad of tomato, onion, and cilantro.",
    lat: -12.9714, lng: -38.5014,
    countryName: "Brazil", isoCode: "BR",
    cuisineSlug: "bahian-cuisine",
    dishTypes: ["appetizer", "street-snack"],
    wikipediaSlug: "Acaraj%C3%A9",
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
  // ─── Network expansion — added with the food-network knowledge map pass.
  // Cuisines needed for the 30 new dishes we just seeded. Each is a real
  // cuisine / sub-cuisine with Wikipedia-level recognition; slug keys are
  // kebab-case, names are title-cased, descriptions are short.
  { slug: "chinese-cuisine",     name: "Chinese cuisine",        description: "Cuisine of China, spanning eight great culinary traditions" },
  { slug: "south-indian-cuisine",name: "South Indian cuisine",   description: "Cuisine of the Indian states south of the Vindhya range — Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana" },
  { slug: "goan-cuisine",        name: "Goan cuisine",           description: "Cuisine of Goa, shaped by Portuguese colonial influence on an Indo-Konkan base" },
  { slug: "nepali-cuisine",      name: "Nepali cuisine",         description: "Cuisine of Nepal, with strong Tibetan and North Indian influences" },
  { slug: "maghrebi-cuisine",    name: "Maghrebi cuisine",       description: "Cuisine of the Maghreb — Morocco, Algeria, Tunisia, Libya, Mauritania" },
  { slug: "jordanian-cuisine",   name: "Jordanian cuisine",      description: "Cuisine of Jordan, anchored by Bedouin and Levantine traditions" },
  { slug: "ukrainian-cuisine",   name: "Ukrainian cuisine",      description: "Cuisine of Ukraine" },
  { slug: "portuguese-cuisine",  name: "Portuguese cuisine",     description: "Cuisine of Portugal" },
  { slug: "mexican-cuisine",     name: "Mexican cuisine",        description: "Cuisine of Mexico" },
  { slug: "argentine-cuisine",   name: "Argentine cuisine",      description: "Cuisine of Argentina" },
  { slug: "caribbean-cuisine",   name: "Caribbean cuisine",      description: "Cuisine of the Caribbean islands — Puerto Rico, Cuba, Dominican Republic, Jamaica and neighbors" },
  { slug: "bahian-cuisine",      name: "Bahian cuisine",         description: "Cuisine of Bahia, Brazil — Afro-Brazilian roots with Portuguese and West African influences" },
  { slug: "northern-thai-cuisine", name: "Northern Thai cuisine",description: "Cuisine of northern Thailand (Lanna), with Burmese, Lao, and Shan influences" },
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
  { slug: "side",          name: "Side dish",     description: "Side dishes — fried plantains, bread accompaniments" },
  { slug: "street-snack",  name: "Street snack",  description: "Handheld market foods" },
  { slug: "fermented",     name: "Fermented dish",description: "Dishes where fermentation is the primary transformation" },
];

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

export type RelationType =
  | "family"            // same food family (dumpling, noodle soup, etc.)
  | "regional-cousin"   // neighboring-region variation
  | "diaspora"          // diaspora adaptation
  | "shared-ingredient" // shares a key ingredient base
  | "shared-method"     // uses the same core cooking technique
  | "similar-serving"   // served in similar contexts (street snack, dessert)
  | "ancestor"          // historical ancestor
  | "descendant";       // historical descendant

export interface SeedRelation {
  from: string;
  to: string;
  relationType: RelationType;
  reason: string;
  strength: 1 | 2 | 3 | 4 | 5;
}

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
  { from: "jiaozi",   to: "momo",     relationType: "family",            reason: "Same filled-dough form, traded along the Silk Road", strength: 5 },
  { from: "jiaozi",   to: "pierogi",  relationType: "regional-cousin",   reason: "Crescent-shaped filled dumplings of Eastern Europe and East Asia", strength: 4 },
  { from: "momo",     to: "pierogi",  relationType: "family",            reason: "Both half-moon dumplings, related through Central Asian trade routes", strength: 4 },
  { from: "momo",     to: "jiaozi",   relationType: "shared-method",     reason: "Both steamed in a bamboo or metal steamer", strength: 3 },

  // ─── Noodle soup cluster ───────────────────────────────────────────────
  { from: "ramen-japanese", to: "pho-vietnamese", relationType: "regional-cousin", reason: "Both Asian brothy noodle soups that crossed paths via Chinese diaspora", strength: 4 },
  { from: "ramen-japanese", to: "udon",           relationType: "family",           reason: "Both Japanese wheat-noodle dishes, ramen thinner and richer", strength: 5 },
  { from: "udon",           to: "soba",           relationType: "family",           reason: "Both iconic Japanese noodle families, udon wheat vs soba buckwheat", strength: 5 },
  { from: "laksa",          to: "pho-vietnamese", relationType: "regional-cousin",  reason: "Both Southeast Asian noodle soups, laksa spiced with rempah", strength: 4 },
  { from: "laksa",          to: "tom-yum",        relationType: "shared-method",    reason: "Both built on a pounded rempah (lemongrass-galangal-chili) base", strength: 5 },
  { from: "khao-soi",       to: "laksa",          relationType: "regional-cousin",  reason: "Both coconut-curry noodle soups of the greater Mekong region", strength: 5 },
  { from: "khao-soi",       to: "ramen-japanese", relationType: "family",           reason: "Both noodle soups with a clear broth and protein topping", strength: 3 },

  // ─── Curry / spiced-sauce cluster ──────────────────────────────────────
  { from: "rendang",              to: "chicken-tikka-masala", relationType: "shared-method",   reason: "Both slow-cooked in a spice paste until the sauce reduces", strength: 4 },
  { from: "rendang",              to: "goulash-hungarian",    relationType: "family",          reason: "Both paprika-and-onion spiced meat stews", strength: 4 },
  { from: "vindaloo",             to: "chicken-tikka-masala", relationType: "regional-cousin", reason: "Both Indian restaurant-style curries, Goan vs Punjabi", strength: 4 },
  { from: "vindaloo",             to: "biryani-hyderabadi",   relationType: "family",          reason: "Both Goan-Persian legacies in Indian cooking", strength: 3 },
  { from: "vindaloo",             to: "bacalhau-a-bras",      relationType: "ancestor",        reason: "Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo", strength: 5 },
  { from: "chicken-tikka-masala", to: "biryani-hyderabadi",   relationType: "family",          reason: "Both pillars of restaurant-style South Asian cuisine", strength: 4 },

  // ─── Rice-dish cluster ─────────────────────────────────────────────────
  { from: "nasi-goreng",          to: "jollof-rice",          relationType: "regional-cousin", reason: "Both fried/tomato rice dishes at the heart of national identity", strength: 4 },
  { from: "nasi-goreng",          to: "nasi-campur-bali",     relationType: "family",          reason: "Both Indonesian rice plates, nasi goreng is a single-dish version", strength: 5 },
  { from: "paella-valenciana",    to: "risotto-alla-milanese",relationType: "shared-method",   reason: "Both rice dishes built around a sofrito / soffritto base", strength: 4 },
  { from: "jollof-rice",          to: "biryani-hyderabadi",   relationType: "ancestor",        reason: "Biryani's Persian-layered rice tradition is the documented ancestor of jollof", strength: 4 },
  { from: "risotto-alla-milanese", to: "paella-valenciana",   relationType: "regional-cousin", reason: "Both short-grain rice dishes, Italian vs Iberian", strength: 4 },

  // ─── Indonesian / Balinese cluster ─────────────────────────────────────
  { from: "babi-guling",      to: "sate-lilit",        relationType: "regional-cousin", reason: "Both iconic Balinese ceremonial preparations", strength: 5 },
  { from: "babi-guling",      to: "nasi-campur-bali",  relationType: "regional-cousin", reason: "Babi guling is often the centerpiece of nasi campur Bali", strength: 5 },
  { from: "soto-ayam",        to: "rawon",             relationType: "regional-cousin", reason: "Both Indonesian clear soups with a spice-paste base", strength: 5 },
  { from: "soto-ayam",        to: "pho-vietnamese",    relationType: "regional-cousin", reason: "Both clear-broth soups of the East and Southeast Asian seaboard", strength: 4 },
  { from: "gado-gado",        to: "nasi-campur-bali",  relationType: "shared-method",   reason: "Both built around a peanut sauce dressed at the table", strength: 4 },
  { from: "gado-gado",        to: "hummus",            relationType: "similar-serving", reason: "Both sit at the intersection of vegetables and a thick legume sauce", strength: 3 },
  { from: "pempek",           to: "acaraje",           relationType: "similar-serving", reason: "Both street foods with a fried-bean-or-fish base and a strong sauce", strength: 4 },
  { from: "rendang",          to: "nasi-campur-bali",  relationType: "family",          reason: "Rendang is one of the classic components of nasi campur", strength: 5 },
  { from: "rendang",          to: "sate-lilit",        relationType: "family",          reason: "Both use a coconut-milk-spice paste marinade on meat", strength: 4 },
  { from: "rawon",            to: "rendang",           relationType: "family",          reason: "Both Indonesian spice-paste dishes of the Javanese sphere", strength: 4 },
  { from: "rawon",            to: "soto-ayam",         relationType: "family",          reason: "Both Indonesian soups built on a turmeric-tinged spice paste", strength: 4 },
  { from: "sate-lilit",       to: "shawarma",          relationType: "family",          reason: "Both skewered grilled meats of the spice-trade corridor", strength: 4 },

  // ─── East Asian cluster ────────────────────────────────────────────────
  { from: "mapo-tofu",        to: "jiaozi",            relationType: "shared-method",   reason: "Both Sichuan staples sharing doubanjiang and chili oil", strength: 4 },
  { from: "mapo-tofu",        to: "kimchi-jjigae",     relationType: "regional-cousin", reason: "Both spicy stews of the East Asian mainland and peninsula", strength: 3 },
  { from: "congee",           to: "pho-vietnamese",    relationType: "similar-serving", reason: "Both comfort-food breakfast bowls of the East and SE Asian rim", strength: 4 },
  { from: "congee",           to: "ramen-japanese",    relationType: "similar-serving", reason: "Both warm, slow-cooked grain or noodle bowls eaten any time of day", strength: 3 },
  { from: "congee",           to: "soto-ayam",         relationType: "family",          reason: "Both thin-broth rice-based dishes, Asian rice porridge family", strength: 4 },
  { from: "udon",             to: "ramen-japanese",    relationType: "family",          reason: "Both Japanese noodle soups, udon is the thicker wheat sibling", strength: 5 },
  { from: "japchae",          to: "bibimbap",          relationType: "family",          reason: "Both Korean dishes combining noodles/rice with vegetables and sesame oil", strength: 4 },
  { from: "japchae",          to: "kimchi-jjigae",     relationType: "shared-method",   reason: "Both built on sesame oil and soy sauce, central to Korean home cooking", strength: 4 },
  { from: "japchae",          to: "pho-vietnamese",    relationType: "similar-serving", reason: "Both noodle dishes served as part of a multi-component meal", strength: 3 },

  // ─── Thai cluster ──────────────────────────────────────────────────────
  { from: "tom-yum",          to: "pad-thai",          relationType: "family",          reason: "Both quintessential Thai dishes built on rempah", strength: 5 },
  { from: "khao-soi",         to: "tom-yum",           relationType: "family",          reason: "Both Thai soups with a lemongrass-galangal base, khao-soi adds coconut", strength: 4 },
  { from: "khao-soi",         to: "chicken-tikka-masala", relationType: "shared-method", reason: "Both slow-simmered in a coconut or cream spiced broth", strength: 3 },

  // ─── European cluster ──────────────────────────────────────────────────
  { from: "pizza-margherita", to: "cacio-e-pepe",      relationType: "family",          reason: "Both pillars of Roman-Neapolitan home cooking", strength: 4 },
  { from: "tiramisu",         to: "tarte-tatin",       relationType: "similar-serving", reason: "Both iconic European desserts, layered or caramelised", strength: 3 },
  { from: "bacalhau-a-bras",  to: "paella-valenciana", relationType: "family",          reason: "Both Iberian dishes built around salt cod or seafood on the Iberian peninsula", strength: 4 },
  { from: "risotto-alla-milanese", to: "jollof-rice", relationType: "shared-method",   reason: "Both rice dishes cooked slowly with constant stirring in seasoned broth", strength: 3 },
  { from: "borscht",          to: "goulash-hungarian", relationType: "family",          reason: "Both Central/Eastern European paprika-and-onion comfort dishes", strength: 4 },
  { from: "borscht",          to: "kimchi-jjigae",     relationType: "shared-ingredient", reason: "Both fermented-vegetable-led soups, beet vs napa cabbage", strength: 3 },
  { from: "borscht",          to: "rawon",             relationType: "family",          reason: "Both deep-coloured national soups with deep historical roots", strength: 3 },

  // ─── Middle Eastern / N African cluster ───────────────────────────────
  { from: "couscous",         to: "tagine-moroccan",   relationType: "family",          reason: "Both Maghrebi staples, served together in Morocco and Tunisia", strength: 5 },
  { from: "couscous",         to: "biryani-hyderabadi", relationType: "shared-method",   reason: "Both steamed grain dishes layered with aromatic broth and meat", strength: 4 },
  { from: "shakshuka",        to: "hummus",            relationType: "family",          reason: "Both Levantine brunch staples, served together across the Eastern Mediterranean", strength: 4 },
  { from: "shakshuka",        to: "falafel",           relationType: "family",          reason: "Both core Levantine street foods, often eaten in the same meal", strength: 4 },
  { from: "shakshuka",        to: "menemen",           relationType: "family",          reason: "Both egg-in-tomato-pepper dishes of the Eastern Mediterranean", strength: 5 },
  { from: "mansaf",           to: "hummus",            relationType: "family",          reason: "Both Levantine cultural icons, central to hospitality", strength: 3 },
  { from: "mansaf",           to: "shawarma",          relationType: "family",          reason: "Both cornerstone dishes of Levantine street and ceremony", strength: 3 },
  { from: "hummus",           to: "falafel",           relationType: "family",          reason: "The hummus-falafel duo defines modern Middle Eastern street food", strength: 5 },

  // ─── Latin American / Caribbean cluster ───────────────────────────────
  { from: "tamales",          to: "empanada",          relationType: "family",          reason: "Both filled-dough parcels of the Latin American tradition", strength: 4 },
  { from: "tamales",          to: "pierogi",           relationType: "family",          reason: "Both steamed/boiled dough parcels with a savory filling, trans-Atlantic cousins", strength: 3 },
  { from: "ceviche-peruvian", to: "tostones",          relationType: "regional-cousin", reason: "Both anchor dishes of the Caribbean rim and the northern coast of South America", strength: 4 },
  { from: "feijoada",         to: "acaraje",           relationType: "family",          reason: "Both Brazilian national dishes with deep Afro-Brazilian roots", strength: 5 },
  { from: "acaraje",          to: "pempek",            relationType: "similar-serving", reason: "Both fried-bean-or-fish snacks served with a contrasting sauce", strength: 4 },
  { from: "empanada",         to: "samosa",            relationType: "family",          reason: "Both filled pastry turnovers, Iberian via colonial trade to South Asia", strength: 3 },
  { from: "tostones",         to: "fries",             relationType: "similar-serving", reason: "Both twice-cooked starch sides served across the Americas", strength: 3 },

  // ─── Indian subcontinent cluster ──────────────────────────────────────
  { from: "dosa",             to: "biryani-hyderabadi", relationType: "family",          reason: "Both South Indian classics, dosa for breakfast and biryani for celebration", strength: 4 },
  { from: "dosa",             to: "vindaloo",          relationType: "family",          reason: "Both coastal Indian preparations of the Konkan-Goan sphere", strength: 3 },
  { from: "dosa",             to: "idli",              relationType: "family",          reason: "Both share a fermented rice-and-lentil batter", strength: 5 },
  { from: "vindaloo",         to: "shakshuka",         relationType: "shared-method",   reason: "Both tomato-and-vinegar stews with chili heat, Goan and Levantine cousins", strength: 3 },

  // ─── Moussaka neighbours ──────────────────────────────────────────────
  { from: "moussaka-greek",   to: "musakka-turkish",   relationType: "regional-cousin", reason: "Greek and Turkish moussaka are the canonical regional cousins", strength: 5 },

  // ─── Hamburger diaspora ───────────────────────────────────────────────
  { from: "hamburger-american", to: "banh-mi",         relationType: "family",          reason: "Both sandwich form, banh-mi is the baguette cousin of the bun", strength: 3 },
  { from: "hamburger-american", to: "shawarma",        relationType: "diaspora",        reason: "Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants", strength: 2 },

  // ─── Sushi / ceviche (raw-acidified protein) ──────────────────────────
  { from: "sushi",            to: "ceviche-peruvian",  relationType: "shared-method",   reason: "Both rely on acid or salt to 'cook' raw fish", strength: 4 },

  // ─── Casserole / stew near-neighbours ─────────────────────────────────
  { from: "boeuf-bourguignon", to: "goulash-hungarian", relationType: "family",         reason: "Both beef braises of continental Europe with red wine or paprika", strength: 4 },
  { from: "tagine-moroccan",   to: "boeuf-bourguignon", relationType: "shared-method",  reason: "Both long-braised stews in a covered vessel", strength: 3 },

  // ─── Wiener Schnitzel diaspora ────────────────────────────────────────
  { from: "wiener-schnitzel", to: "cotoletta",         relationType: "regional-cousin", reason: "Italian cotoletta alla milanese is the debated ancestor of Wiener schnitzel", strength: 4 },
  { from: "wiener-schnitzel", to: "tonkatsu",          relationType: "diaspora",        reason: "Tonkatsu is the Japanese adaptation of European breaded cutlets", strength: 4 },

  // ─── Shawarma / kebab global cluster ──────────────────────────────────
  { from: "shawarma",         to: "döner",             relationType: "family",          reason: "Both vertical-spit grilled meats of the Ottoman diaspora", strength: 5 },

  // ─── Brazilian / Iberian long arc ─────────────────────────────────────
  { from: "feijoada",         to: "bacon-and-cabbage", relationType: "regional-cousin", reason: "Both bean-and-pork stews, Portuguese-Atlantic cousins", strength: 3 },

  // ─── Fish-cake / fritter global family ────────────────────────────────
  { from: "pempek",           to: "falafel",           relationType: "similar-serving", reason: "Both deep-fried handheld snacks of Indonesia and the Levant", strength: 3 },
  { from: "pempek",           to: "fish-cake",         relationType: "family",          reason: "Both minced-fish-and-starch cakes fried in oil", strength: 4 },

  // ─── Bread family: pizza / focaccia / pita ────────────────────────────
  { from: "pizza-margherita", to: "focaccia",          relationType: "family",          reason: "Both flat Italian breads, pizza adds tomato topping", strength: 4 },
  { from: "pizza-margherita", to: "pita",              relationType: "family",          reason: "Both flatbreads of the Mediterranean basin, oven-baked", strength: 3 },

  // ─── Misc diaspora / method edges to strengthen the network ────────────
  { from: "biryani-hyderabadi", to: "nasi-goreng",      relationType: "family",          reason: "Both layered or fried rice dishes of Muslim-majority regions", strength: 3 },
  { from: "khao-soi",         to: "curry",             relationType: "family",          reason: "Khao soi is a curry-style noodle soup of the Chiang Mai region", strength: 4 },
  { from: "udon",             to: "soba",              relationType: "family",          reason: "Both Japanese noodle families, the canonical wheat-vs-buckwheat pair", strength: 4 },
  { from: "congee",           to: "risotto-alla-milanese", relationType: "family",     reason: "Both slow-stirred rice dishes that release starch for a creamy texture", strength: 4 },
  { from: "babi-guling",      to: "lechon",            relationType: "family",          reason: "Both spit-roasted whole pigs of Southeast Asia", strength: 5 },
  { from: "sate-lilit",       to: "kofta",             relationType: "family",          reason: "Both minced-meat preparations formed around a skewer or spit", strength: 4 },
  { from: "momo",             to: "samosa",            relationType: "family",          reason: "Both hand-held filled dough pockets of the South Asian / Himalayan rim", strength: 4 },
  { from: "mapo-tofu",        to: "shakshuka",         relationType: "shared-method",   reason: "Both tofu/egg dishes simmered in a chili-flecked tomato-pepper sauce", strength: 3 },
  { from: "congee",           to: "porridge",          relationType: "family",          reason: "Both warm grain porridges eaten at breakfast across continents", strength: 5 },
  { from: "tostones",         to: "patacones",         relationType: "family",          reason: "Same twice-fried green-plantain dish, Caribbean vs Colombian name", strength: 5 },
  { from: "empanada",         to: "samosa",            relationType: "family",          reason: "Both stuffed pastries, empanada Iberian and samosa Central Asian/South Asian", strength: 4 },
  { from: "acaraje",          to: "vada",              relationType: "family",          reason: "Both deep-fried legume fritters of Afro-Brazilian and South Indian cuisines", strength: 4 },
  { from: "tamales",          to: "humita",            relationType: "family",          reason: "Both Mesoamerican corn-based parcels, tamales in dough, humitas looser", strength: 4 },
  { from: "couscous",         to: "bulgur",            relationType: "family",          reason: "Both processed-wheat staples of the Eastern Mediterranean", strength: 4 },
  { from: "mansaf",           to: "lamb-and-rice",     relationType: "family",          reason: "Both lamb-and-rice combinations of pastoral cuisines", strength: 3 },

  // ─── Sambal / chili condiment cluster ──────────────────────────────────
  { from: "rendang",          to: "sambal",            relationType: "shared-ingredient", reason: "Both rely on a chili paste, rendang inside the dish, sambal as table condiment", strength: 3 },
  { from: "soto-ayam",        to: "sambal",            relationType: "shared-ingredient", reason: "Soto is incomplete without a dollop of sambal on the side", strength: 4 },

  // ─── Preserved seafood / umami cluster ────────────────────────────────
  { from: "bacalhau-a-bras",  to: "ikan-bakar",        relationType: "family",          reason: "Both salt-cured or grilled fish dishes of maritime cuisines", strength: 3 },
  { from: "ceviche-peruvian", to: "poke",              relationType: "diaspora",        reason: "Hawaiian poke is the Pacific diaspora cousin of ceviche-style raw fish", strength: 3 },

  // ─── Bridging gaps: a few more 5-strength canonical anchors ───────────
  { from: "pho-vietnamese",   to: "khao-soi",          relationType: "family",          reason: "Both Southeast/East Asian noodle soups in the broth-and-protein family", strength: 5 },
  { from: "hummus",           to: "baba-ganoush",      relationType: "family",          reason: "Both Levantine dips at the heart of the meze table", strength: 5 },
  { from: "tom-yum",          to: "laksa",             relationType: "family",          reason: "Both tom-yum-derived broths, Thai vs Peranakan", strength: 4 },
  { from: "paella-valenciana", to: "jollof-rice",      relationType: "family",          reason: "Both saffron-tinted rice dishes of the Atlantic world, paella vs jollof", strength: 3 },
  { from: "moussaka-greek",   to: "moussaka-levant",   relationType: "regional-cousin", reason: "Levantine moussaka uses tomato and chickpeas, the Greek version adds béchamel", strength: 5 },
];
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

export const LINEAGE_METHODS: Array<{ slug: string; name: string; category: string }> = [
  { slug: "poached-in-sauce",     name: "Poached in sauce",       category: "moist-heat" },
  { slug: "omelettes-and-scrambles", name: "Omelettes & scrambles", category: "dry-heat"   },
  { slug: "fried-and-topped",     name: "Fried & topped",         category: "dry-heat"   },
  { slug: "steamed-and-custard",   name: "Steamed & custard",       category: "moist-heat" },
  { slug: "boiled-and-cured",     name: "Boiled & cured",         category: "moist-heat" },
  { slug: "pasta",                name: "Pasta",                   category: "moist-heat" },
  { slug: "noodle-soup",          name: "Noodle soup",              category: "moist-heat" },
  { slug: "stew",                 name: "Stew & braise",           category: "moist-heat" },
  { slug: "fried-rice",           name: "Rice bowl",               category: "dry-heat"   },
  { slug: "dumpling",             name: "Dumpling",                category: "moist-heat" },
  { slug: "bread",                name: "Bread & dough",           category: "dry-heat"   },
  { slug: "pancake",              name: "Flatbread",               category: "dry-heat"   },
  { slug: "dessert",              name: "Sweets & custard",         category: "dry-heat"   },
  { slug: "curry",                name: "Curry",                   category: "moist-heat" },
  { slug: "kebab",                name: "Grilled & skewered",      category: "dry-heat"   },
  { slug: "salad",                name: "Small plates & preserves",category: "raw"        },
];

// dish slug → lineage method slug (one of LINEAGE_METHODS above).
// Distribution: stew 11 · rice 9 · small-plates 7 · noodle-soup 7 · dumpling 4
// · bread/fried-topped/kebab/curry 3 each · dessert/boiled-cured/poached 2 each
// · pasta/pancake/omelette/steamed 1 each. No dish falls back to "other".
export const DISH_LINEAGES: Record<string, string> = {
  "moussaka-greek":        "fried-and-topped",
  "cacio-e-pepe":          "pasta",
  "pizza-margherita":      "bread",
  "paella-valenciana":     "fried-rice",
  "gazpacho":              "salad",
  "tarte-tatin":           "dessert",
  "boeuf-bourguignon":     "stew",
  "wiener-schnitzel":      "fried-and-topped",
  "pierogi":               "dumpling",
  "goulash-hungarian":     "stew",
  "ramen-japanese":        "noodle-soup",
  "sushi":                 "boiled-and-cured",
  "pad-thai":              "noodle-soup",
  "tom-yum":               "stew",
  "pho-vietnamese":        "noodle-soup",
  "banh-mi":               "bread",
  "hainanese-chicken-rice":"fried-rice",
  "nasi-goreng":           "fried-rice",
  "bibimbap":              "fried-rice",
  "kimchi-jjigae":         "stew",
  "hummus":                "salad",
  "falafel":               "salad",
  "shawarma":              "kebab",
  "biryani-hyderabadi":    "fried-rice",
  "chicken-tikka-masala":  "curry",
  "feijoada":              "stew",
  "ceviche-peruvian":      "boiled-and-cured",
  "hamburger-american":    "bread",
  "poutine":               "fried-and-topped",
  "tagine-moroccan":       "stew",
  "jollof-rice":           "fried-rice",
  "babi-guling":           "kebab",
  "rendang":               "curry",
  "soto-ayam":             "stew",
  "rawon":                 "stew",
  "gado-gado":             "salad",
  "pempek":                "salad",
  "nasi-campur-bali":      "fried-rice",
  "sate-lilit":            "kebab",
  "laksa":                 "noodle-soup",
  "khao-soi":              "noodle-soup",
  "udon":                  "noodle-soup",
  "mapo-tofu":             "poached-in-sauce",
  "congee":                "fried-rice",
  "moussaka-levant":       "fried-and-topped",
  "baba-ganoush":          "salad",
  "shakshuka":             "poached-in-sauce",
  "tacos-al-pastor":       "kebab",
  "tamales-mexican":       "steamed-and-custard",
  "dim-sum":               "steamed-and-custard",
  "pho-bo":                "noodle-soup",
  "ramen-tonkotsu":        "noodle-soup",
  "tonkatsu":              "fried-and-topped",
  "okonomiyaki":           "fried-and-topped",
  "croque-monsieur":       "fried-and-topped",
  "omelette":              "omelettes-and-scrambles",
  "khachapuri":            "bread",
  "bigos":                 "stew",
};
