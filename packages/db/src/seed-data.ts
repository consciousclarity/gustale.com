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
  "acaraje":                   "fried-and-topped",
  "bacalhau-a-bras":           "fried-and-topped",
  "borscht":                   "stew",
  "couscous":                   "steamed-and-custard",
  "dosa":                      "fried-and-topped",
  "empanada":                   "fried-and-topped",
  "japchae":                   "fried-rice",
  "jiaozi":                    "steamed-and-custard",
  "mansaf":                     "stew",
  "momo":                       "steamed-and-custard",
  "risotto-alla-milanese":      "fried-and-topped",
  "tamales":                    "steamed-and-custard",
  "tiramisu":                   "dessert",
  "tostones":                   "fried-and-topped",
  "vindaloo":                   "stew",
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

export type SeedLineageHistoricalForce =
  | "migration" | "trade_route" | "empire" | "colonization" | "diaspora"
  | "religious_exchange" | "port_city_exchange" | "agricultural_spread"
  | "technological_change" | "local_adaptation" | "parallel_evolution"
  | "cultural_exchange" | "nomadic_pastoral" | "war_and_displacement";

export type SeedLineageRole =
  | "ancestor" | "descendant" | "cousin" | "regional_variant"
  | "adaptation" | "fusion" | "diaspora_adaptation" | "trade_route_spread"
  | "colonial_spread" | "technique_relative" | "ingredient_relative"
  | "possible_influence" | "parallel_evolution" | "uncertain";

export type SeedConfidenceLevel =
  | "documented" | "likely" | "probable" | "possible" | "uncertain"
  | "parallel_evolution";

export type SeedChangedElement =
  | "ingredient" | "spice_profile" | "cooking_method" | "shape"
  | "filling" | "dough" | "grain" | "preservation_method"
  | "serving_context" | "religious_rule" | "local_availability"
  | "cooking_fat" | "wrapper" | "fermentation_time";

export interface SeedDishLineageEdge {
  dishSlug: string;
  role: SeedLineageRole;
  explanation: string;
  changedElements: SeedChangedElement[];
  confidenceLevel: SeedConfidenceLevel;
  sortOrder: number;
}

export interface SeedLineage {
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  conceptSummary: string;
  originSummary: string;
  originRegions: string[];
  relatedRegions: string[];
  historicalForces: SeedLineageHistoricalForce[];
  primaryTechnique: string;
  techniques: string[];
  baseIngredients: string[];
  courseGroups: string[];
  relatedFamilies: string[];
  representativeDishes: string[]; // illustrative names, may include dishes NOT in Gustale yet
  confidenceLevel: SeedConfidenceLevel;
  uncertaintyNote: string;
  culturalPracticeNote: string;
  sourceNotes: string;
  displayOrder: number;
  dishMappings: SeedDishLineageEdge[];
}

export const LINEAGES: SeedLineage[] = [
  // ─── 1. Filled dough / dumpling lineage ─────────────────────────────
  {
    slug: "filled-dough",
    name: "Filled Dough Across Eurasia",
    shortDescription: "Dough wrapped around a filling, then steamed, boiled, baked, or fried — the most traveled food shape on earth.",
    longDescription: "Filled dough is one of the clearest examples of parallel invention meeting historical transmission. The basic idea — wrap a filling in a thin dough, cook it — appears independently across at least four macro-regions (East Asia, Central Asia, the Mediterranean, Eastern Europe), and once those traditions met along the Silk Road and the Mongol expansion, they cross-pollinated for centuries. The result is a chain of related forms: jiaozi, momo, manti, pierogi, ravioli, empanada, samosa, and more.",
    conceptSummary: "A portable, hand-shaped meal: a wrapper of grain flour, a savory or sweet interior, and a fast cooking method. The lineage is a network of cousins, not a single family tree.",
    originSummary: "No single origin. Wheat-based filled dough appears in Mediterranean antiquity (Roman lagana, later ravioli); wheat- and millet-based filled dough appears independently in northern China by the Han dynasty. The shape spread along trade and conquest routes, then absorbed local fillings.",
    originRegions: ["East Asia", "Central Asia", "Mediterranean basin", "Northern China"],
    relatedRegions: ["Eastern Europe", "South Asia", "Central Asia", "Italy", "Mongolia", "Tibet", "Nepal"],
    historicalForces: ["trade_route", "empire", "parallel_evolution", "cultural_exchange"],
    primaryTechnique: "filling-and-sealing",
    techniques: ["steaming", "boiling", "pan-frying", "deep-frying", "baking"],
    baseIngredients: ["wheat flour", "rice flour", "minced meat", "vegetables", "cheese", "legumes"],
    courseGroups: ["main-course", "appetizer", "street-snack"],
    relatedFamilies: ["dumpling", "pasta", "pancake"],
    representativeDishes: ["Jiaozi", "Momo", "Manti", "Mantı", "Pelmeni", "Pierogi", "Ravioli", "Tortellini", "Gyoza", "Mandu", "Empanada", "Samosa", "Khinkali", "Pasty"],
    confidenceLevel: "likely",
    uncertaintyNote: "The relationship between Central Asian manti and East Asian jiaozi is well documented through Silk Road transmission. The relationship between those and Italian ravioli is more debated — direct transmission vs. shared Mediterranean + Levantine roots is unresolved.",
    culturalPracticeNote: "Filled dough is overwhelmingly festive food: Lunar New Year jiaozi in northern China, Tibetan Losar momo, Christmas pierogi in Poland, Ramadan manti in some Central Asian households. The act of folding is often communal.",
    sourceNotes: "Wikipedia: Jiaozi, Momo (dumpling), Pierogi, Ravioli; Encyclopedia of Food and Health (2016); Darra Goldstein, A Fork in the Road (2014).",
    displayOrder: 10,
    dishMappings: [
      {
        dishSlug: "jiaozi",
        role: "ancestor",
        explanation: "Wheat-flour wrapper folded around pork or vegetable filling, then boiled or pan-fried. The Han-dynasty reference (c. 200 CE) is one of the earliest documented filled doughs in East Asia.",
        changedElements: ["dough", "filling", "shape", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "momo",
        role: "cousin",
        explanation: "Thin wheat wrapper, finely ground meat or vegetable filling, steamed. Likely transmitted from Chinese jiaozi along Himalayan trade routes, then adapted to local ingredients (yak, buffalo, Tibetan herbs). The 'likely related' link to jiaozi is widely accepted; the specifics of transmission are debated.",
        changedElements: ["filling", "shape", "wrapper", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 9,
      },
      {
        dishSlug: "pierogi",
        role: "cousin",
        explanation: "Wheat-flour wrapper folded over a savory filling (potato, cheese, sauerkraut, mushroom, meat), then boiled and often pan-fried with onions. Eastern European adaptation with influences from Italian and Ottoman cuisine — direct line is debated.",
        changedElements: ["filling", "cooking_fat", "serving_context"],
        confidenceLevel: "possible",
        sortOrder: 7,
      },
      {
        dishSlug: "empanada",
        role: "cousin",
        explanation: "Wheat or corn dough folded around a meat or vegetable filling, then baked or fried. Iberian in origin (likely from the Arabic influence on medieval Spain), then carried to the Americas. Shares the 'folded filled dough' idea with Eurasian dumplings but the historical connection is indirect.",
        changedElements: ["dough", "cooking_method", "filling"],
        confidenceLevel: "possible",
        sortOrder: 6,
      },
      {
        dishSlug: "dim-sum",
        role: "technique_relative",
        explanation: "Cantonese tradition of small filled dough parcels — steamed dumplings, buns, rolls — served as part of yum cha. Shares the filled-dough idea with jiaozi but emerged as a distinct tea-house tradition in southern China.",
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
    shortDescription: "Unleavened or lightly leavened grain flatbread, baked on a griddle, in a clay oven, or stuck to the wall of a tandoor — the oldest bread idea on earth.",
    longDescription: "Flatbread predates leavened bread in nearly every grain civilization. The form is shaped by three forces: the local grain (wheat, millet, teff, maize, rice flour), the cooking technology (griddle, tandoor, saj, comal, clay oven), and the meal context (daily staple, festival bread, wrap for kebab). Flatbreads spread along trade routes and through empire — naan and lavash moved with Persian and Ottoman influence, tortilla with maize agriculture, arepa with pre-Columbian South American systems, injera with Ethiopian teff cultivation.",
    conceptSummary: "Grain flour + water + heat = a flat cooked bread. The shape of the bread is a record of the grain, the oven, and the meal that surrounds it.",
    originSummary: "No single origin. Flatbread is the default bread form whenever grain cultivation begins: Neolithic Middle East for wheat and barley, the Ethiopian highlands for teff, Mesoamerica for maize, the Indian subcontinent for millet flatbreads.",
    originRegions: ["Fertile Crescent", "Ethiopian Highlands", "Mesoamerica", "South Asia"],
    relatedRegions: ["North Africa", "Andean region", "Levant", "Iranian Plateau", "Italy", "Mexico"],
    historicalForces: ["agricultural_spread", "empire", "trade_route", "parallel_evolution"],
    primaryTechnique: "griddle-or-oven-baking",
    techniques: ["griddle-baking", "tandoor-baking", "clay-oven-baking", "pan-frying"],
    baseIngredients: ["wheat flour", "maize flour", "teff flour", "millet flour", "rice flour", "water", "salt", "yeast"],
    courseGroups: ["side", "main-course", "appetizer", "bread"],
    relatedFamilies: ["bread", "pancake"],
    representativeDishes: ["Naan", "Pita", "Lavash", "Roti", "Chapati", "Tortilla", "Arepa", "Injera", "Focaccia", "Manakish", "Yufka", "Markook"],
    confidenceLevel: "documented",
    uncertaintyNote: "Each flatbread tradition has its own grain and oven, and 'shared ancestor' claims across continents are weaker than within a continent. The wheat flatbreads of West Asia form a coherent family; the maize flatbreads of the Americas form another.",
    culturalPracticeNote: "Flatbread is the daily bread of roughly half the world's population. Breaking bread together is a near-universal ritual; in Ethiopia, gursha (feeding a friend by hand from one's own injera) is a sign of deep affection.",
    sourceNotes: "Wikipedia: Flatbread, Naan, Injera, Tortilla; H. G. Manniche, Sacred Luxuries (1999); Rachel Laudan, Cuisine and Empire (2013).",
    displayOrder: 20,
    dishMappings: [
      {
        dishSlug: "pizza-margherita",
        role: "descendant",
        explanation: "Italian flatbread topped with tomato, cheese, and oil. The flatbread lineage is ancient; pizza-as-topped-flatbread emerged in Naples in the 18th–19th century after tomato arrived from the Americas.",
        changedElements: ["filling", "cooking_method", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "khachapuri",
        role: "cousin",
        explanation: "Georgian filled flatbread, traditionally stuffed with cheese and egg. A regional variant of the broader Levantine-and-Caucasian flatbread tradition, enriched with local dairy.",
        changedElements: ["filling", "shape", "cooking_method"],
        confidenceLevel: "likely",
        sortOrder: 7,
      },
      {
        dishSlug: "banh-mi",
        role: "fusion",
        explanation: "Vietnamese baguette sandwich. The baguette itself is a French colonial import; the sandwich is a fusion of French bread with Vietnamese fillings (pâté, pickled vegetables, cilantro, chili). A clear case of colonial-era transmission.",
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
    shortDescription: "Rice cooked in fat with aromatics, then steamed with broth, spices, meat, or seafood — a lineage shaped by Mughal, Persian, Mediterranean, and West African traditions.",
    longDescription: "The 'rice as carrier' idea — toasting the grains in fat with onions and spices, then simmering in broth until tender — appears independently across at least three regions: Persian polow, Mughal biryani, and Mediterranean paella. These are not all descendants of one ancestor: rice agriculture itself spread from Asia to the Mediterranean via multiple routes, and each region developed its own technique. The result is a network of related but distinct traditions.",
    conceptSummary: "Rice cooked with a flavorful fat and aromatic base, with regional spice and protein choices layered in.",
    originSummary: "Rice domestication is in the Yangtze valley (c. 8000 BCE). Pilaf/polo techniques developed in Persian-influenced Central Asia and spread westward through Mughal India, Ottoman Turkey, and into the Mediterranean. West African jollof evolved separately through rice cultivation in the Niger basin.",
    originRegions: ["Persia", "Mughal India", "Mediterranean", "West Africa"],
    relatedRegions: ["Spain", "Iranian Plateau", "Indian subcontinent", "Indonesia", "Mali", "Senegal", "Italy"],
    historicalForces: ["agricultural_spread", "empire", "trade_route", "parallel_evolution"],
    primaryTechnique: "toasted-rice-then-steamed",
    techniques: ["pilaf method", "dum cooking", "absorbption method", "risotto method"],
    baseIngredients: ["rice", "onion", "oil or ghee", "broth", "saffron", "spices", "meat", "seafood"],
    courseGroups: ["main-course"],
    relatedFamilies: ["rice-dish", "fried-rice", "stew"],
    representativeDishes: ["Pilaf", "Plov", "Biryani", "Kabsa", "Paella", "Risotto", "Nasi Goreng", "Jollof Rice", "Arroz con Pollo", "Mandi"],
    confidenceLevel: "likely",
    uncertaintyNote: "The link between Persian polo and Indian biryani is well documented via Mughal expansion. The link between Persian polo and West African jollof is much weaker — both use rice-as-carrier but developed independently. Spanish paella is a Mediterranean cousin, not a descendant of Persian pilaf.",
    culturalPracticeNote: "Biryani is a festive dish across South Asia, often served at weddings and Eid. Paella is cooked communally over an open fire in Valencia. Jollof rice is a point of friendly rivalry between Ghana, Nigeria, Senegal, and Cameroon — each claims the best version.",
    sourceNotes: "Wikipedia: Pilaf, Biryani, Paella, Jollof rice; Claudia Roden, A Book of Middle Eastern Food (1968); Madhur Jaffrey, A Taste of India (1985).",
    displayOrder: 30,
    dishMappings: [
      {
        dishSlug: "paella-valenciana",
        role: "regional_variant",
        explanation: "Valencia's rice-as-carrier: short-grain bomba rice, saffron, olive oil, seafood or rabbit, cooked uncovered over an open fire. Shares the 'toasted rice + broth' technique with Persian polo but evolved independently in Spain.",
        changedElements: ["spice_profile", "cooking_fat", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 9,
      },
      {
        dishSlug: "biryani-hyderabadi",
        role: "regional_variant",
        explanation: "Hyderabadi biryani: basmati rice layered with marinated meat, fried onions, saffron, and aromatics, then slow-cooked sealed (dum). A clear descendant of Persian pilaf via Mughal influence, adapted with local spice profiles.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "jollof-rice",
        role: "parallel_evolution",
        explanation: "West African rice cooked in a tomato-pepper base with onions, scotch bonnets, and thyme. The tomato-pepper base is post-Columbian; the rice-cooking technique has local roots. The relationship to pilaf is 'same logic, different ingredients, different history.'",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 7,
      },
      {
        dishSlug: "nasi-goreng",
        role: "cousin",
        explanation: "Indonesian fried rice: leftover rice stir-fried with kecap manis, garlic, shallots, and toppings. Carries Indian and Chinese rice-cooking influence via trade; uses local sweet soy and sambal.",
        changedElements: ["cooking_method", "spice_profile", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 6,
      },
      {
        dishSlug: "risotto-alla-milanese",
        role: "cousin",
        explanation: "Italian rice cooked by gradually adding hot broth, with saffron and beef-bone-marrow fat. Shares 'rice cooked in flavorful liquid' with pilaf but uses a different technique (stirred addition vs. absorption).",
        changedElements: ["cooking_method", "cooking_fat", "spice_profile"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 6,
      },
      {
        dishSlug: "bibimbap",
        role: "cousin",
        explanation: "Korean rice bowl with seasoned vegetables, meat, egg, and gochujang. A 'rice-as-base' dish with local toppings; the technique is closer to fried rice than to pilaf but shares the carrier-grain idea.",
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
    shortDescription: "Wheat or rice noodles served in broth, transformed by stock base, spice paste, toppings, and migration — one of the most traveled broth-and-noodle traditions.",
    longDescription: "Noodle soup is the convergence of two ideas: noodle-making (which spread along the Silk Road and via Arab trade) and broth-based soup (which is universal). Each region then layered its own logic: dashi in Japan, beef broth in Vietnam, coconut and spice paste in Malaysia, beef bone and marrow in China. Colonial migration carried these forms to new countries and created fusion traditions like Vietnamese phở in diaspora or Laksa in port cities.",
    conceptSummary: "Noodles + broth + toppings, with the broth being the most culturally specific part.",
    originSummary: "Noodles likely originated in northern China during the Han dynasty (c. 200 BCE). Wheat noodles spread west through the Silk Road; rice noodles developed in southern China and Southeast Asia. Each region built its own broth tradition on top of the imported noodle.",
    originRegions: ["Northern China", "Southeast Asia", "Mediterranean"],
    relatedRegions: ["Japan", "Korea", "Vietnam", "Thailand", "Malaysia", "Indonesia", "Italy"],
    historicalForces: ["trade_route", "colonial_spread", "diaspora", "local_adaptation"],
    primaryTechnique: "broth-cooked-noodles",
    techniques: ["broth simmering", "wok hei (breath of the wok)", "topping arrangement", "noodle pulling"],
    baseIngredients: ["wheat noodles", "rice noodles", "broth (meat, fish, or bone)", "aromatics", "toppings"],
    courseGroups: ["main-course", "street-snack"],
    relatedFamilies: ["noodle-soup", "pasta"],
    representativeDishes: ["Ramen", "Pho", "Laksa", "Soto Mie", "Khao Soi", "Udon", "Mie Ayam", "Bakso", "Saimin"],
    confidenceLevel: "documented",
    uncertaintyNote: "The transmission from Chinese lamian to Japanese ramen is well documented (Chinese immigrants in Yokohama, late 19th century). The link between Asian noodle soups and Italian pasta is more contested — both derive from noodle-making traditions that may share ancient Central Asian roots, but the parallel-evolution hypothesis is also strong.",
    culturalPracticeNote: "Slurping noodles is the polite way to eat ramen in Japan (it cools the noodles and shows appreciation). Pho is a breakfast food in Vietnam. Khao Soi is a regional specialty of northern Thailand with Burmese-Muslim influences.",
    sourceNotes: "Wikipedia: Noodle soup, Ramen, Pho, Laksa; George Solt, The Untold History of Ramen (2014); Lucien X. Polastron, The Book of Noodles (2013).",
    displayOrder: 40,
    dishMappings: [
      {
        dishSlug: "ramen-japanese",
        role: "adaptation",
        explanation: "Wheat noodles in a meat or fish broth with tare (seasoning base) and toppings. Adapted from Chinese lamian by immigrants in late-19th-century Japan; evolved into a fully Japanese dish with dashi and shoyu.",
        changedElements: ["serving_context", "spice_profile", "ingredient"],
        confidenceLevel: "documented",
        sortOrder: 10,
      },
      {
        dishSlug: "pho-vietnamese",
        role: "fusion",
        explanation: "Rice noodles in beef or chicken broth with star anise, cinnamon, and charred onion. Combines Chinese noodle technique with Vietnamese broth traditions; emerged in northern Vietnam in the early 20th century.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "pad-thai",
        role: "regional_variant",
        explanation: "Stir-fried rice noodles with tamarind, fish sauce, peanuts, and lime. A 20th-century Thai nationalist dish that incorporates Chinese noodle technique with local Southeast Asian flavors.",
        changedElements: ["cooking_method", "spice_profile", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 7,
      },
      {
        dishSlug: "tom-yum",
        role: "cousin",
        explanation: "Hot-and-sour Thai soup, often served with rice or noodles. Shares 'broth + aromatics' with noodle soups but the dish itself is soup-with-optional-noodles, not noodles-in-broth.",
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
    shortDescription: "Edible wrappers — vine leaves, cabbage, peppers, tomatoes, eggplant — filled with grains, herbs, meat, or legumes, then braised. A Mediterranean-to-Central-Asian family with deep ritual roots.",
    longDescription: "The idea of stuffing a vegetable or leaf and slow-cooking it appears across the Mediterranean, the Levant, the Caucasus, and Central Asia. The Greek gemista, Turkish dolma, Armenian tolma, and Lebanese stuffed grape leaves (warak enab) form a coherent family. The form has ritual roots: stuffed vegetables are festival food across multiple cultures, including Greek Easter, Ottoman celebrations, and Levantine family gatherings.",
    conceptSummary: "An edible wrapper or vessel filled with a seasoned grain or meat mixture, then slow-braised until the wrapper softens and absorbs the filling's flavor.",
    originSummary: "Stuffed vegetables are documented in Ottoman and Persian court cuisines by the medieval period. The technique likely predates the Ottoman Empire through Persian and Arab cookery. Related forms (cabbage rolls) exist independently in Eastern European cuisine.",
    originRegions: ["Ottoman Empire", "Levant", "Persia"],
    relatedRegions: ["Greece", "Turkey", "Armenia", "Lebanon", "Egypt", "Eastern Europe"],
    historicalForces: ["empire", "religious_exchange", "cultural_exchange"],
    primaryTechnique: "filling-then-braising",
    techniques: ["rolling", "braising", "baking", "simmering in oil and lemon"],
    baseIngredients: ["grape leaves", "cabbage", "peppers", "tomatoes", "zucchini", "rice", "minced meat", "herbs", "olive oil", "lemon"],
    courseGroups: ["appetizer", "main-course", "side"],
    relatedFamilies: ["casserole", "stew"],
    representativeDishes: ["Dolma", "Sarma", "Gemista", "Stuffed Peppers", "Cabbage Rolls", "Warak Enab", "Tolma", "Yaprak Sarma"],
    confidenceLevel: "likely",
    uncertaintyNote: "Eastern European cabbage rolls (holubtsi, golabki, sarma) are related to the Ottoman stuffed-grape-leaves family but the precise route of transmission is debated. Some scholars argue parallel invention; others argue Ottoman influence via the Balkans.",
    culturalPracticeNote: "In Armenian, Levantine, and Greek households, the preparation of stuffed vegetables is a multi-generational activity — usually women and older girls, with the eldest supervising the rolling technique.",
    sourceNotes: "Wikipedia: Dolma, Gemista, Cabbage roll; Priscilla Parkhurst Ferguson, Accounting for Taste (2004); Anissa Helou, Mediterranean Street Food (2014).",
    displayOrder: 50,
    dishMappings: [
      {
        dishSlug: "moussaka-greek",
        role: "cousin",
        explanation: "Greek moussaka is a layered casserole (eggplant, meat, béchamel) rather than a stuffed-leaf dish, but it shares the 'assembled-and-baked vegetable' logic with gemista and is part of the broader Ottoman-influenced Greek repertoire.",
        changedElements: ["shape", "cooking_method", "serving_context"],
        confidenceLevel: "possible",
        sortOrder: 4,
      },
      {
        dishSlug: "hummus",
        role: "uncertain",
        explanation: "Chickpea-tahini spread, a Levantine staple. Listed here as 'uncertain' because hummus is not stuffed but the dish is a frequent partner to stuffed leaves in the same meal context.",
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
    shortDescription: "Small pieces or minced meat threaded on sticks and cooked over open fire — shaped by street food, nomadic cooking, ritual, and marinades across Eurasia and beyond.",
    longDescription: "Skewered meat appears across most grilling cultures: shish kebab (Persian/Turkish), satay (Indonesian/Malaysian), yakitori (Japanese), souvlaki (Greek), anticuchos (Andean), brochettes (French), seekh kebab (South Asian). The shared idea is small pieces + fire + marinade + stick, but the marinade, protein, and context vary widely. Some forms are clearly connected by trade and empire (kebab across Ottoman-influenced regions); others are parallel inventions.",
    conceptSummary: "Small pieces of meat or offal on a stick, cooked over fire. The marinade and the context (street food, festival, daily meal) are the cultural signature.",
    originSummary: "Skewered cooking likely emerged independently wherever open-fire cooking met nomadic or street-food culture. Persian kebab traditions spread through the Ottoman Empire; satay likely reflects Indian-Muslim trade influence on Indonesian cuisine; yakitori developed in Edo-period Japan.",
    originRegions: ["Persian Plateau", "Anatolia", "Levant", "Indian subcontinent", "Southeast Asia", "Andean region"],
    relatedRegions: ["Greece", "Turkey", "Japan", "Indonesia", "Malaysia", "Peru", "Mongolia"],
    historicalForces: ["empire", "trade_route", "nomadic_pastoral", "parallel_evolution"],
    primaryTechnique: "skewer-and-grill",
    techniques: ["skewering", "marinating", "open-flame grilling", "charcoal grilling"],
    baseIngredients: ["lamb", "beef", "chicken", "pork", "offal", "yogurt", "spice pastes", "soy sauce", "peanut sauce"],
    courseGroups: ["main-course", "street-snack", "appetizer"],
    relatedFamilies: ["kebab"],
    representativeDishes: ["Kebab", "Satay", "Yakitori", "Souvlaki", "Anticucho", "Shashlik", "Brochette", "Seekh Kebab", "Chuan'r"],
    confidenceLevel: "likely",
    uncertaintyNote: "The link between Persian kebab and Greek souvlaki is debated: Ottoman influence is likely, but Greek grilling traditions predate the Ottoman Empire. Japanese yakitori and Andean anticuchos are parallel inventions, not descendants of the Persian tradition.",
    culturalPracticeNote: "Satay is the national street food of Indonesia, with regional variations from Madura (sweet, ketupat accompaniment) to Padang (thick yellow sauce). Anticuchos are tied to the Afro-Peruvian cooking tradition, using beef heart — a legacy of African diaspora and Andean guinea-pig (cuy) cooking.",
    sourceNotes: "Wikipedia: Kebab, Satay, Yakitori, Anticucho; Anissa Helou, Lebanon: A Culinary Journey (2012); Sarah Lohman, Endangered Eating (2022).",
    displayOrder: 60,
    dishMappings: [
      {
        dishSlug: "shawarma",
        role: "cousin",
        explanation: "Levantine spit-roasted meat, shaved and served in flatbread. Related to doner kebab (Ottoman/Turkish) and döner (modern Turkish). Shares the grilled-meat-as-meal idea with kebab but uses vertical spit roasting.",
        changedElements: ["cooking_method", "shape", "serving_context"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "tacos-al-pastor",
        role: "cousin",
        explanation: "Mexican pork tacos cooked on a vertical spit (trompo), served on small tortillas with pineapple, onion, and cilantro. The spit-roasting technique is Lebanese-immigrant influence (shawarma arrived in Mexico via Lebanese diaspora in the 19th–20th century); the tortilla, pineapple, and chili are local Mexican elements.",
        changedElements: ["ingredient", "cooking_method", "serving_context", "spice_profile"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
    ],
  },

  // ─── 7. Curry / spiced stew lineage ────────────────────────────────
  {
    slug: "curry-spiced-stew",
    name: "Curry and Spiced Stew",
    shortDescription: "Spiced sauce/stew systems — but not one thing. Local names, local spice logic, local techniques. A lineage of related ideas rather than a single dish.",
    longDescription: "The word 'curry' is a European colonial-era label for an enormous range of spiced dishes across South Asia, Southeast Asia, Japan, and the Caribbean. Indian curry traditions are anchored by regional spice blends (garam masala, sambar powder, vindaloo masala). Thai, Japanese, and Malaysian curry traditions are related through trade and Buddhist-Muslim exchange but developed distinct spice profiles. Caribbean curry reflects Indian indentured-labour diaspora. Rendang is a dry-spiced slow-cooked meat from Minangkabau cuisine, related to curry but distinct.",
    conceptSummary: "A spiced sauce or stew where the spice blend is the cultural signature, not the protein.",
    originSummary: "Spiced stews are ancient in the Indian subcontinent (sambar, kuzhambu). Trade carried curry traditions to Southeast Asia (Thai massaman, Malay laksa paste, Indonesian rendang), East Asia (Japanese curry via British colonial influence), and the Caribbean (via Indian indentured labour in the 19th century).",
    originRegions: ["Indian subcontinent"],
    relatedRegions: ["Thailand", "Japan", "Malaysia", "Indonesia", "Caribbean", "South Africa"],
    historicalForces: ["trade_route", "colonial_spread", "diaspora", "religious_exchange"],
    primaryTechnique: "spice-paste-cooking",
    techniques: ["dry-roasting spices", "wet grinding", "tempering (tadka)", "slow braising", "coconut-milk reduction"],
    baseIngredients: ["turmeric", "cumin", "coriander", "chili", "ginger", "garlic", "coconut milk", "yogurt", "onion", "tomato"],
    courseGroups: ["main-course"],
    relatedFamilies: ["curry", "stew"],
    representativeDishes: ["Indian Curry", "Thai Curry", "Japanese Curry", "Kari Ayam", "Rendang", "Massaman Curry", "Dal", "Tagine", "Vindaloo"],
    confidenceLevel: "likely",
    uncertaintyNote: "The link between Indian curry and Thai massaman is documented (massaman derives from the Malay word 'masam' meaning sour, and the spice profile reflects Persian/Indian trade). The link between Indian curry and Japanese curry is more recent — late-19th-century British colonial influence. Caribbean curry reflects 19th-century Indian diaspora.",
    culturalPracticeNote: "Rendang is cooked for hours until the coconut milk is fully absorbed and the spices caramelize on the meat — it's a Minangkabau ceremonial dish. Japanese curry is a weekly staple and is often considered a 'homestyle' dish.",
    sourceNotes: "Wikipedia: Curry, Massaman curry, Rendang, Japanese curry; Colleen Taylor Sen, Curry: A Global History (2009); Sri Owen, The Rice Book (1993).",
    displayOrder: 70,
    dishMappings: [
      {
        dishSlug: "chicken-tikka-masala",
        role: "regional_variant",
        explanation: "Roasted chicken chunks in a creamy tomato-onion sauce with garam masala. Often called a British-Indian dish — likely invented in the UK by Bangladeshi chefs in the 1960s. A diaspora adaptation of Indian murgh makhani.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
      {
        dishSlug: "rendang",
        role: "regional_variant",
        explanation: "Minangkabau slow-cooked dry curry: beef simmered in coconut milk and spice paste for hours until dry and deeply caramelized. A distinct Indonesian curry tradition.",
        changedElements: ["cooking_method", "serving_context", "spice_profile"],
        confidenceLevel: "documented",
        sortOrder: 9,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "parallel_evolution",
        explanation: "Korean kimchi stew: fermented kimchi simmered with pork or tuna. A spiced stew with a fermented base — shares the 'spice-forward slow-cooked stew' idea with curry but the spice profile and base are entirely distinct.",
        changedElements: ["ingredient", "spice_profile", "cooking_method"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 4,
      },
      {
        dishSlug: "tagine-moroccan",
        role: "cousin",
        explanation: "Moroccan slow-cooked stew named after the clay pot. Spiced with ras el hanout and preserved lemon. Shares 'slow-cooked spiced stew' with curry but uses North African spice traditions.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 5,
      },
      {
        dishSlug: "goulash-hungarian",
        role: "cousin",
        explanation: "Hungarian beef stew with paprika, onion, and sometimes peppers and potatoes. A Central European spiced stew — shares 'spiced braised meat' with curry but uses Hungarian paprika as the signature spice.",
        changedElements: ["spice_profile", "cooking_method", "serving_context"],
        confidenceLevel: "parallel_evolution",
        sortOrder: 5,
      },
      {
        dishSlug: "vindaloo",
        role: "regional_variant",
        explanation: "Goan Portuguese-influenced curry: meat marinated in vinegar, garlic, and chili. Reflects Portuguese colonial influence on Indian cooking; the name derives from Portuguese 'carne de vinha d'alhos' (meat in wine vinegar and garlic).",
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
    shortDescription: "Beans transformed by microbial fermentation into umami-dense condiments, pastes, and solids — preservation, religion, regional bean-processing traditions.",
    longDescription: "Fermented bean products are deeply East Asian, with regional traditions stretching from Japanese miso and natto to Korean doenjang and gochujang to Indonesian tempeh to Chinese doubanjiang and soy sauce. Soy domestication is in northern China; fermentation techniques then radiated across East and Southeast Asia. The products are often tied to Buddhist vegetarian cooking (which favored plant-based protein) and to preservation in pre-refrigeration societies.",
    conceptSummary: "Beans + salt + time + microbial transformation = a concentrated source of umami and a powerful preservative.",
    originSummary: "Soy fermentation likely emerged in China during the Zhou dynasty (c. 1000 BCE). Tempeh spread from Indonesia through Dutch colonial trade. Japanese miso and Korean doenjang developed independently from Chinese soy paste traditions.",
    originRegions: ["Northern China"],
    relatedRegions: ["Japan", "Korea", "Indonesia", "Southeast Asia", "India", "Nepal"],
    historicalForces: ["agricultural_spread", "religious_exchange", "trade_route"],
    primaryTechnique: "fermentation",
    techniques: ["solid-state fermentation", "liquid fermentation", "mold cultivation", "long aging"],
    baseIngredients: ["soybeans", "salt", "water", "grains (rice, barley, wheat)", "chili", "koji mold"],
    courseGroups: ["condiment", "side", "main-course"],
    relatedFamilies: ["fermented", "sauce"],
    representativeDishes: ["Tempeh", "Miso", "Natto", "Soy Sauce", "Doenjang", "Gochujang", "Tauco", "Tofu", "Doubanjiang", "Miso Soup"],
    confidenceLevel: "documented",
    uncertaintyNote: "The transmission from Chinese soy paste to Korean doenjang and Japanese miso is well documented through trade and Buddhist monastic exchange. The link to Indonesian tempeh is more debated — possibly independent fermentation of local beans (temu, before soy arrived).",
    culturalPracticeNote: "Miso is considered a daily staple in Japan, used in miso soup at breakfast and as a base for many sauces. Gochujang is used in Korean ancestral rites — the fermented red paste is offered to ancestors during Lunar New Year.",
    sourceSources: "Wikipedia: Tempeh, Miso, Soy sauce, Doenjang, Gochujang; Shurtleff & Aoyagi, The Book of Miso (1976); Han Kee-sue, Gochujang: Korea's Favorite Condiment (2018).",
    displayOrder: 80,
    dishMappings: [
      {
        dishSlug: "mapo-tofu",
        role: "regional_variant",
        explanation: "Sichuan tofu in a fermented bean paste and doubanjiang sauce with chili and sichuan pepper. A direct descendant of the Chinese fermented-bean lineage, served as a tofu dish.",
        changedElements: ["serving_context", "spice_profile", "cooking_method"],
        confidenceLevel: "documented",
        sortOrder: 8,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "cousin",
        explanation: "Korean stew using aged kimchi and often doenjang. Shares the 'fermented base + slow-cooked stew' idea with Chinese fermented bean pastes but the kimchi fermentation is distinct.",
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
    shortDescription: "Dough fried in fat, then sweetened or savoured — festival food, street food, religious fast-day food.",
    longDescription: "Fried dough appears across cultures, often tied to religious calendars (Lenten doughnuts before Easter, Hanukkah sufganiyot, Diwali gujia, Ramadan sfenj). The link between Old-World fried doughs is partially historical (European doughnuts likely influenced by Dutch oliekoeken, which spread via trade) and partially parallel (every grain culture has a fried-dough tradition). Churros may have Portuguese or Moorish roots; loukoumades are Greek with possible Egyptian antecedents.",
    conceptSummary: "Wheat or rice flour dough, deep-fried, often sugared, often shaped (rings, sticks, balls, twists). Festival food almost universally.",
    originSummary: "Multiple origins. Fried dough appears in ancient Mediterranean, Indian, and East Asian cuisines. Specific forms — churros, loukoumades, jalebi, youtiao — have distinct documented histories.",
    originRegions: ["Mediterranean", "South Asia", "East Asia"],
    relatedRegions: ["Iberia", "Mesoamerica", "Southeast Asia", "North Africa", "Middle East"],
    historicalForces: ["trade_route", "religious_exchange", "cultural_exchange", "parallel_evolution"],
    primaryTechnique: "deep-frying",
    techniques: ["deep-frying", "shaping by hand or mold", "syrup-glazing", "sugar-dusting"],
    baseIngredients: ["wheat flour", "rice flour", "yeast", "eggs", "sugar", "honey", "oil"],
    courseGroups: ["dessert", "street-snack"],
    relatedFamilies: ["dessert", "street-snack"],
    representativeDishes: ["Donut", "Churros", "Loukoumades", "Jalebi", "Beignet", "Zeppole", "Youtiao", "Sfenj", "Gujia", "Boortsog"],
    confidenceLevel: "likely",
    uncertaintyNote: "The link between Spanish churros and Portuguese filhós is debated; both derive from a Mediterranean fried-pastry tradition. The link between Indian jalebi and Middle Eastern zalabiya is documented (the name and shape travelled). The relationship between East Asian youtiao and European fried dough is largely parallel invention.",
    culturalPracticeNote: "Youtiao (oil strip) is eaten with congee for breakfast across China. Churros are a Spanish late-night snack. Jalebi is offered at Hindu temples and is central to Diwali celebrations.",
    sourceNotes: "Wikipedia: Churro, Jalebi, Loukoumades, Youtiao; Gil Marks, Encyclopedia of Jewish Food (2010); Michael Krondl, Sweet Invention (2011).",
    displayOrder: 90,
    dishMappings: [
      {
        dishSlug: "tiramisu",
        role: "uncertain",
        explanation: "Italian coffee-flavored dessert with mascarpone and soaked ladyfingers. Not fried — included to flag a known gap in Gustale's coverage of fried-dough and pastry forms.",
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
    shortDescription: "Salt, fermentation, and time transform fish and shellfish into umami-dense condiments and pastes — a coastal foodway that links the Mediterranean to Southeast Asia.",
    longDescription: "Fermented fish sauce is one of the oldest condiments in the world: Roman garum (made from fish guts and salt) was a Mediterranean staple for centuries, and nuoc mam (Vietnamese), patis (Filipino), nam pla (Thai), and shottsuru (Japanese) all derive from the same basic process — salt + fish + time = liquid umami. Anchovy paste, shrimp paste (terasi/belacan), and aged fish pastes like Thai pla ra represent different ends of the same logic.",
    conceptSummary: "Fish + salt + fermentation time = a concentrated source of salt and umami. Used as a condiment, a cooking base, or a finishing note.",
    originSummary: "Fish fermentation is documented in ancient Mediterranean (garum), Southeast Asia (fish sauces of the Austronesian world), and East Asia. The technique appears independently in coastal cultures with abundant fish stocks and salt.",
    originRegions: ["Mediterranean", "Southeast Asia", "East Asia"],
    relatedRegions: ["Italy", "Vietnam", "Thailand", "Philippines", "Japan", "Korea", "Rome"],
    historicalForces: ["trade_route", "cultural_exchange", "parallel_evolution"],
    primaryTechnique: "salt-fermentation",
    techniques: ["salt curing", "liquid fermentation", "paste fermentation", "long aging"],
    baseIngredients: ["small fish", "shrimp", "salt", "water"],
    courseGroups: ["condiment", "side"],
    relatedFamilies: ["sauce", "fermented"],
    representativeDishes: ["Garum", "Fish Sauce (Nuoc Mam)", "Shrimp Paste (Belacan)", "Pla Ra", "Bagoong", "Cincalok", "Anchovy Paste", "Colatura di Alici"],
    confidenceLevel: "documented",
    uncertaintyNote: "The parallel between Roman garum and Southeast Asian fish sauces is well documented as parallel invention rather than direct transmission. Korean salted shrimp (saeu-jeot) and Japanese shiokara are part of the same coastal-fermentation family.",
    culturalPracticeNote: "In Vietnam, nuoc mam is a daily condiment and a marker of family identity — every family has its preferred brand and source. Garum was so central to Roman cooking that it was a major industry in Pompeii and salted-fish factories dotted the Mediterranean coast.",
    sourceNotes: 'Wikipedia: Garum, Fish sauce, Shrimp paste, Pla ra; Eric C. Barrett, "The Shape of Roman Fishing Economy" (2019); Penny Van Esterik, "Fish Sauce in Southeast Asian Foodways" (1992).',
    displayOrder: 100,
    dishMappings: [],
  },

  // ─── 11. Chili sauce and condiment lineage ─────────────────────────
  {
    slug: "chili-condiment",
    name: "Chili Sauces and Condiments",
    shortDescription: "Chili as a post-Columbian global ingredient — ground, fermented, and preserved into local condiment systems. Sambal, harissa, salsa, gochujang, sriracha — same ingredient, five continents of adaptation.",
    longDescription: "All chili peppers descend from plants domesticated in Mesoamerica. They reached the rest of the world only after the Columbian Exchange (post-1492). Yet within 200 years, chili had been absorbed into virtually every cuisine: sambal in Indonesia/Malaysia, harissa in North Africa, salsa in Mexico, gochujang in Korea, Sichuan chili oil in China, chili paste in Sichuan. Each tradition developed its own grinding, fermenting, and preserving logic.",
    conceptSummary: "Chili + local grinding/fermenting/preserving = a condiment that becomes the signature flavor of a regional table.",
    originSummary: "Chili domestication is in central Mexico (c. 6000 BCE). After 1492, chili spread to the Philippines (via Spanish galleon trade), then to China, India, Southeast Asia, Africa, and the Middle East. Each region integrated it into existing condiment traditions.",
    originRegions: ["Mesoamerica"],
    relatedRegions: ["Mexico", "Peru", "Korea", "Sichuan", "Indonesia", "Malaysia", "North Africa", "Thailand"],
    historicalForces: ["colonial_spread", "agricultural_spread", "local_adaptation"],
    primaryTechnique: "grinding-and-fermenting",
    techniques: ["stone-grinding", "mortar-grinding", "fermentation", "oil-infusion", "smoking"],
    baseIngredients: ["chili peppers", "salt", "garlic", "vinegar", "sugar", "oil", "fermented bean paste"],
    courseGroups: ["condiment", "sauce"],
    relatedFamilies: ["sauce", "fermented"],
    representativeDishes: ["Sambal", "Harissa", "Salsa Roja", "Gochujang", "Sriracha", "Ajvar", "Zhug", "Nam Prik", "Chili Oil", "Shatta"],
    confidenceLevel: "documented",
    uncertaintyNote: "All chili condiments share a common ancestor (Mesoamerican domesticated chili), but the preparation methods diverged radically — sambal is fresh-ground chili, harissa is a wet paste, gochujang is fermented with soybeans. We list this as a lineage because the shared ingredient is the spine; the variations are the story.",
    culturalPracticeNote: "Gochujang is used in Korean ancestral rites and is one of the three foundational sauces (with soy sauce and doenjang). Sambal is the daily chili accompaniment in Indonesia and Malaysia — every meal has sambal. Harissa is central to Maghrebi identity and is eaten with almost every savory dish in Tunisia.",
    sourceNotes: "Wikipedia: Sambal, Harissa, Gochujang, Sriracha; Dave DeWitt, The Chili Pepper Encyclopedia (2011); Seung-hee Lee, Gochujang: A Korean Fermented Condiment (2019).",
    displayOrder: 110,
    dishMappings: [
      {
        dishSlug: "soto-ayam",
        role: "cousin",
        explanation: "Indonesian chicken soup with sambal and lime. Sambal is the chili condiment backbone of Indonesian cuisine; soto-ayam is one of many dishes built around it.",
        changedElements: ["serving_context"],
        confidenceLevel: "documented",
        sortOrder: 3,
      },
      {
        dishSlug: "kimchi-jjigae",
        role: "cousin",
        explanation: "Korean stew often seasoned with gochujang or served with kimchi. The chili-condiment backbone of Korean cuisine.",
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
    shortDescription: "Food wrapped in leaves for steaming, grilling, carrying, preserving, or ritual — banana leaves, corn husks, palm leaves, lotus leaves, bamboo leaves.",
    longDescription: "Leaf-wrapped cooking is one of the oldest portable-food techniques: tamales in Mesoamerica, zongzi in China, pepes in Indonesia, otak-otak in Singapore, pasteles in the Caribbean, bánh chưng in Vietnam, lemper in Java, bacalhau com natas in Portugal. The shared idea is the leaf as a cooking vessel, flavoring agent, and preservation wrap. The technique is ritual-heavy: tamales for Day of the Dead, zongzi for Dragon Boat Festival, bánh chưng for Lunar New Year.",
    conceptSummary: "Food wrapped in leaves, then steamed, grilled, or boiled. The leaf contributes flavor, structure, and ritual meaning.",
    originSummary: "Leaf-wrapping appears independently in Mesoamerica (corn-husk tamales), East Asia (bamboo-leaf zongzi), and Southeast Asia (banana-leaf pepes). Each tradition is tied to local grain agriculture and ritual cycles.",
    originRegions: ["Mesoamerica", "East Asia", "Southeast Asia"],
    relatedRegions: ["Mexico", "China", "Vietnam", "Indonesia", "Caribbean", "Singapore"],
    historicalForces: ["religious_exchange", "agricultural_spread", "parallel_evolution", "war_and_displacement"],
    primaryTechnique: "leaf-wrapping-and-steaming",
    techniques: ["steaming in leaves", "grilling in leaves", "boiling in leaves", "long steaming"],
    baseIngredients: ["corn husks", "banana leaves", "bamboo leaves", "lotus leaves", "palm leaves", "rice", "meat", "fish", "coconut"],
    courseGroups: ["main-course", "snack", "festival-food"],
    relatedFamilies: ["casserole", "steamed-and-custard"],
    representativeDishes: ["Tamales", "Pepes", "Otak-Otak", "Zongzi", "Pasteles", "Lemper", "Bánh Chưng", "Pamonha", "Hallaca"],
    confidenceLevel: "documented",
    uncertaintyNote: "All leaf-wrapped foods share the 'leaf as vessel' logic but emerged independently in multiple continents. The Mesoamerican tamal tradition predates European contact by thousands of years; Chinese zongzi dates back at least to the Warring States period. They are parallel inventions, not transmissions.",
    culturalPracticeNote: "Bánh chưng is the symbolic dish of Vietnamese Lunar New Year (Tết): the square shape represents the Earth, the filling represents prosperity. Tamales are central to Mesoamerican Day of the Dead (Día de los Muertos) celebrations, with families gathering to make them together.",
    sourceNotes: "Wikipedia: Tamale, Zongzi, Otak-Otak, Bánh chưng; Rachel Laudan, Cuisine and Empire (2013); Jeffrey Pilcher, ¡Que vivan los tamales! (1998).",
    displayOrder: 120,
    dishMappings: [
      {
        dishSlug: "dim-sum",
        role: "cousin",
        explanation: "Cantonese small filled parcels often steamed in bamboo baskets. Shares the leaf-wrapped-steamed idea with zongzi but evolved as a tea-house tradition.",
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
    shortDescription: "Grain or legume batter transformed by natural fermentation, then cooked on a griddle, pan, or steamer — a global family from Ethiopian injera to South Indian dosa.",
    longDescription: "Fermented batters appear across most grain cuisines: Ethiopian injera (teff), South Indian dosa and idli (rice and lentil), appam (rice and coconut), sourdough pancakes, Russian blini. The shared logic is grain + water + wild fermentation + heat. These batters are leavened by the fermentation rather than by commercial yeast.",
    conceptSummary: "Grain or legume batter, naturally fermented, then cooked thin on a hot surface.",
    originSummary: "Fermented batter cooking is documented in Ethiopia (teff) and South India (rice-lentil) at least 2000 years ago, almost certainly independently. Sourdough pancake traditions in Eastern Europe and Russia are part of the same logic but with wheat flour.",
    originRegions: ["Ethiopian Highlands", "South India", "Eastern Europe"],
    relatedRegions: ["India", "Sri Lanka", "Russia", "Ukraine", "Ethiopia", "Eritrea"],
    historicalForces: ["parallel_evolution", "religious_exchange", "cultural_exchange"],
    primaryTechnique: "fermented-batter-cooking",
    techniques: ["long fermentation", "griddle cooking", "steaming (for idli)", "thin pouring"],
    baseIngredients: ["teff flour", "rice flour", "lentil flour", "wheat flour", "sourdough starter", "salt", "water"],
    courseGroups: ["main-course", "side", "bread"],
    relatedFamilies: ["pancake", "bread"],
    representativeDishes: ["Injera", "Dosa", "Idli", "Appam", "Sourdough Pancakes", "Blini", "Dhokla", "Pesarattu"],
    confidenceLevel: "documented",
    uncertaintyNote: "Injera (teff), dosa (rice-lentil), and Russian blini (wheat) are parallel inventions — the same logic, three different continents, three different grains. They form a lineage because the shared technique is the spine, not the grain or the geography.",
    culturalPracticeNote: "In Ethiopia and Eritrea, injera is the plate: stews and salads are served on top, and you eat by tearing off pieces of injera with your right hand. South Indian dosa is often eaten with coconut chutney and sambar; idli with sambar and a variety of chutneys.",
    sourceNotes: "Wikipedia: Injera, Dosa, Idli, Blini; Michael Batterson, Ethiopian Cookbook (2020); K. T. Achaya, A Historical Dictionary of Indian Food (1998).",
    displayOrder: 130,
    dishMappings: [
      {
        dishSlug: "dosa",
        role: "ancestor",
        explanation: "South Indian dosa: fermented rice and lentil batter cooked thin on a griddle. A canonical example of the fermented-batter lineage. Often served with coconut chutney and sambar.",
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
    shortDescription: "Filled dough in European and Eurasian branches — ravioli, tortellini, agnolotti, maultaschen, pelmeni, vareniki, pierogi. Connected to the broader filled-dough lineage but with European and Slavic specifics.",
    longDescription: "Stuffed pasta is the European wing of the filled-dough family. Italian ravioli and tortellini (with roots in Roman lagana and medieval Renaissance cuisine), Slavic pelmeni and vareniki, German Maultaschen, and Polish pierogi all share the 'filled dough' logic. The relationship to Central Asian manti and East Asian jiaozi is debated — direct Silk Road transmission vs. shared Mediterranean + Levantine roots.",
    conceptSummary: "Filled wheat dough, often served in broth or with butter and cheese, distinguished by filling and shape.",
    originSummary: "Italian stuffed pasta is documented in the 14th century (Bolognese ravioli references); pelmeni are documented in Siberian cuisine from the 15th century onward. Whether they share a Silk Road ancestor or arose from parallel Mediterranean + Slavic traditions is unresolved.",
    originRegions: ["Italy", "Siberia", "Eastern Europe", "Germany"],
    relatedRegions: ["Italy", "Siberia", "Ukraine", "Poland", "Germany", "Slovenia", "Romania"],
    historicalForces: ["trade_route", "parallel_evolution", "cultural_exchange"],
    primaryTechnique: "filling-and-sealing",
    techniques: ["boiling", "sautéing in butter", "serving in broth", "pan-frying"],
    baseIngredients: ["wheat flour", "egg", "ricotta", "potato", "sauerkraut", "minced meat", "mushroom", "onion"],
    courseGroups: ["main-course", "appetizer"],
    relatedFamilies: ["pasta", "dumpling"],
    representativeDishes: ["Ravioli", "Tortellini", "Agnolotti", "Maultaschen", "Pelmeni", "Vareniki", "Pierogi", "Cappelletti", "Kalduny"],
    confidenceLevel: "possible",
    uncertaintyNote: "The link between Italian stuffed pasta and Slavic pelmeni is debated. Some scholars argue Silk Road transmission from Central Asian manti; others argue parallel European and Slavic invention. We list this as a separate lineage because the European and Slavic forms have enough local character to be studied on their own, while still flagging the overlap with the broader filled-dough lineage.",
    culturalPracticeNote: "Tortellini are stuffed with a meat-and-cheese filling and served in capon broth, especially around Christmas and New Year in Emilia-Romagna. Pelmeni are central to Siberian cuisine and are often frozen in bulk for winter. Pierogi are served at Polish Christmas Eve dinner.",
    sourceNotes: "Wikipedia: Ravioli, Tortellini, Pelmeni, Pierogi; Oretta Zanini De Vita, Encyclopedia of Pasta (2009); Darra Goldstein, A Fork in the Road (2014).",
    displayOrder: 140,
    dishMappings: [
      {
        dishSlug: "pierogi",
        role: "regional_variant",
        explanation: "Polish filled dumplings: wheat-flour dough folded over potato-and-cheese, sauerkraut, mushroom, or meat filling, then boiled and often pan-fried. A Slavic regional variant of the broader filled-dough lineage.",
        changedElements: ["filling", "cooking_fat", "serving_context"],
        confidenceLevel: "likely",
        sortOrder: 8,
      },
      {
        dishSlug: "risotto-alla-milanese",
        role: "uncertain",
        explanation: "Italian saffron risotto. Listed here as uncertain because risotto is not a stuffed pasta but the Lombardy region also has stuffed pasta traditions (agnolotti) — overlap with the lineage.",
        changedElements: [],
        confidenceLevel: "uncertain",
        sortOrder: 1,
      },
    ],
  },
];
