/**
 * National-cuisine categories (one per dish's country of origin).
 * `slug` is the lookup key; `name` is the human-readable label.
 */
export const CUISINE_CATEGORIES: Array<{
  slug: string;
  name: string;
  description: string;
}> = [
  {
    slug: "greek-cuisine",
    name: "Greek cuisine",
    description: "Cuisine of Greece",
  },
  {
    slug: "italian-cuisine",
    name: "Italian cuisine",
    description: "Cuisine of Italy",
  },
  {
    slug: "spanish-cuisine",
    name: "Spanish cuisine",
    description: "Cuisine of Spain",
  },
  {
    slug: "french-cuisine",
    name: "French cuisine",
    description: "Cuisine of France",
  },
  {
    slug: "austrian-cuisine",
    name: "Austrian cuisine",
    description: "Cuisine of Austria",
  },
  {
    slug: "polish-cuisine",
    name: "Polish cuisine",
    description: "Cuisine of Poland",
  },
  {
    slug: "hungarian-cuisine",
    name: "Hungarian cuisine",
    description: "Cuisine of Hungary",
  },
  {
    slug: "japanese-cuisine",
    name: "Japanese cuisine",
    description: "Cuisine of Japan",
  },
  {
    slug: "thai-cuisine",
    name: "Thai cuisine",
    description: "Cuisine of Thailand",
  },
  {
    slug: "vietnamese-cuisine",
    name: "Vietnamese cuisine",
    description: "Cuisine of Vietnam",
  },
  {
    slug: "singaporean-cuisine",
    name: "Singaporean cuisine",
    description: "Cuisine of Singapore",
  },
  {
    slug: "indonesian-cuisine",
    name: "Indonesian cuisine",
    description: "Cuisine of Indonesia",
  },
  {
    slug: "korean-cuisine",
    name: "Korean cuisine",
    description: "Cuisine of South Korea",
  },
  {
    slug: "israeli-cuisine",
    name: "Israeli cuisine",
    description: "Cuisine of Israel",
  },
  {
    slug: "lebanese-cuisine",
    name: "Lebanese cuisine",
    description: "Cuisine of Lebanon",
  },
  {
    slug: "indian-cuisine",
    name: "Indian cuisine",
    description: "Cuisine of India",
  },
  {
    slug: "british-cuisine",
    name: "British cuisine",
    description: "Cuisine of the United Kingdom",
  },
  {
    slug: "brazilian-cuisine",
    name: "Brazilian cuisine",
    description: "Cuisine of Brazil",
  },
  {
    slug: "peruvian-cuisine",
    name: "Peruvian cuisine",
    description: "Cuisine of Peru",
  },
  {
    slug: "american-cuisine",
    name: "American cuisine",
    description: "Cuisine of the United States",
  },
  {
    slug: "canadian-cuisine",
    name: "Canadian cuisine",
    description: "Cuisine of Canada",
  },
  {
    slug: "moroccan-cuisine",
    name: "Moroccan cuisine",
    description: "Cuisine of Morocco",
  },
  {
    slug: "nigerian-cuisine",
    name: "Nigerian cuisine",
    description: "Cuisine of Nigeria",
  },
  // ─── Network expansion — added with the food-network knowledge map pass.
  // Cuisines needed for the 30 new dishes we just seeded. Each is a real
  // cuisine / sub-cuisine with Wikipedia-level recognition; slug keys are
  // kebab-case, names are title-cased, descriptions are short.
  {
    slug: "chinese-cuisine",
    name: "Chinese cuisine",
    description: "Cuisine of China, spanning eight great culinary traditions",
  },
  {
    slug: "south-indian-cuisine",
    name: "South Indian cuisine",
    description:
      "Cuisine of the Indian states south of the Vindhya range — Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana",
  },
  {
    slug: "goan-cuisine",
    name: "Goan cuisine",
    description:
      "Cuisine of Goa, shaped by Portuguese colonial influence on an Indo-Konkan base",
  },
  {
    slug: "nepali-cuisine",
    name: "Nepali cuisine",
    description:
      "Cuisine of Nepal, with strong Tibetan and North Indian influences",
  },
  {
    slug: "maghrebi-cuisine",
    name: "Maghrebi cuisine",
    description:
      "Cuisine of the Maghreb — Morocco, Algeria, Tunisia, Libya, Mauritania",
  },
  {
    slug: "jordanian-cuisine",
    name: "Jordanian cuisine",
    description:
      "Cuisine of Jordan, anchored by Bedouin and Levantine traditions",
  },
  {
    slug: "ukrainian-cuisine",
    name: "Ukrainian cuisine",
    description: "Cuisine of Ukraine",
  },
  {
    slug: "portuguese-cuisine",
    name: "Portuguese cuisine",
    description: "Cuisine of Portugal",
  },
  {
    slug: "mexican-cuisine",
    name: "Mexican cuisine",
    description: "Cuisine of Mexico",
  },
  {
    slug: "argentine-cuisine",
    name: "Argentine cuisine",
    description: "Cuisine of Argentina",
  },
  {
    slug: "caribbean-cuisine",
    name: "Caribbean cuisine",
    description:
      "Cuisine of the Caribbean islands — Puerto Rico, Cuba, Dominican Republic, Jamaica and neighbors",
  },
  {
    slug: "bahian-cuisine",
    name: "Bahian cuisine",
    description:
      "Cuisine of Bahia, Brazil — Afro-Brazilian roots with Portuguese and West African influences",
  },
  {
    slug: "northern-thai-cuisine",
    name: "Northern Thai cuisine",
    description:
      "Cuisine of northern Thailand (Lanna), with Burmese, Lao, and Shan influences",
  },
  {
    slug: "turkish-cuisine",
    name: "Turkish cuisine",
    description:
      "Cuisine of Turkey, shaped by Central Asian, Anatolian, Ottoman, and Mediterranean traditions",
  },
  {
    slug: "colombian-cuisine",
    name: "Colombian cuisine",
    description:
      "Cuisine of Colombia, combining Indigenous, African, Spanish, and regional traditions",
  },
  {
    slug: "filipino-cuisine",
    name: "Filipino cuisine",
    description:
      "Cuisine of the Philippines, shaped by Austronesian, Chinese, Spanish, and American influences",
  },
  {
    slug: "ethiopian-cuisine",
    name: "Ethiopian cuisine",
    description:
      "Cuisine of Ethiopia, known for injera, berbere, and richly spiced communal stews",
  },
];

/**
 * Dish-type categories — taxonomic labels independent of cuisine.
 * Used to power the /dishes filter (e.g. "show me all stews").
 */
export const DISH_TYPE_CATEGORIES: Array<{
  slug: string;
  name: string;
  description: string;
}> = [
  { slug: "pasta", name: "Pasta", description: "Italian-style noodle dishes" },
  {
    slug: "noodle-soup",
    name: "Noodle soup",
    description: "Broth-based noodle dishes (ramen, pho, etc.)",
  },
  { slug: "stew", name: "Stew", description: "Slow-cooked dishes in liquid" },
  {
    slug: "fried-rice",
    name: "Fried rice",
    description: "Stir-fried rice dishes",
  },
  {
    slug: "rice-dish",
    name: "Rice dish",
    description: "Rice as the primary base",
  },
  {
    slug: "sandwich",
    name: "Sandwich",
    description: "Fillings served between bread or in a roll",
  },
  { slug: "soup", name: "Soup", description: "Hot or cold liquid dishes" },
  { slug: "curry", name: "Curry", description: "Spiced sauce-based dishes" },
  {
    slug: "stir-fry",
    name: "Stir-fry",
    description: "Quick-cooked ingredients tossed over high heat",
  },
  {
    slug: "salad",
    name: "Salad",
    description: "Cold, raw or lightly cooked vegetable dishes",
  },
  {
    slug: "pancake",
    name: "Pancake",
    description: "Flat griddled batter cakes",
  },
  {
    slug: "dumpling",
    name: "Dumpling",
    description: "Filled dough parcels (boiled, steamed, fried)",
  },
  {
    slug: "kebab",
    name: "Kebab",
    description: "Skewered and grilled meat or vegetables",
  },
  {
    slug: "bread",
    name: "Bread",
    description: "Baked dough, including flatbreads and focaccia-style",
  },
  { slug: "sauce", name: "Sauce", description: "Condiments or accompaniments" },
  { slug: "dessert", name: "Dessert", description: "Sweet final courses" },
  {
    slug: "casserole",
    name: "Casserole",
    description: "Layered and baked dishes",
  },
  {
    slug: "appetizer",
    name: "Appetizer",
    description: "Small opening courses or snacks",
  },
  {
    slug: "main-course",
    name: "Main course",
    description: "Substantial primary plate",
  },
  {
    slug: "side",
    name: "Side dish",
    description: "Side dishes — fried plantains, bread accompaniments",
  },
  {
    slug: "street-snack",
    name: "Street snack",
    description: "Handheld market foods",
  },
  {
    slug: "fermented",
    name: "Fermented dish",
    description: "Dishes where fermentation is the primary transformation",
  },
];
