#!/usr/bin/env node
/**
 * Mock API server for CI builds.
 *
 * The `wait-for-api.mjs` step in CI tests whether the production API is
 * reachable. GHA runner IPs are blocked by the VPS firewall, so the build
 * falls back to a single placeholder dish and post-build.mjs refuses to
 * ship partial output.
 *
 * This script starts a local HTTP server on a configurable port that
 * serves the same shapes the real API returns — enough for Astro's
 * getStaticPaths and getDishDetail to generate all 60 dish pages.
 *
 * Usage:
 *   node scripts/mock-api.mjs [--port 8742]
 *
 *   The server accepts GET /health, GET /api/dishes, and
 *   GET /api/dishes/:slug. Run it in the background before the build:
 *     node scripts/mock-api.mjs &
 *     MOCK_API_PID=$!
 *     # ... build steps ...
 *     kill $MOCK_API_PID
 *
 *  See .github/workflows/ci.yml for the integration pattern.
 */

import http from 'node:http';
import { URL } from 'node:url';

let PORT = 8742;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && i + 1 < process.argv.length) {
    PORT = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith('--port=')) {
    PORT = parseInt(process.argv[i].split('=')[1], 10);
  }
}
if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 8742;
const HOST = '0.0.0.0';

// ─── Inlined seed data (mirrors packages/db/src/seed-data.ts) ──────────────
// Inlined so this script is self-contained — no TS compiler needed at runtime.

const DISHES = [
  { slug: 'moussaka-greek', canonicalName: 'Moussaka', shortDescription: 'A layered casserole of fried eggplant, spiced minced meat, and béchamel sauce, baked until golden. Considered the national dish of Greece.', lat: 39.0742, lng: 21.8243, countryName: 'Greece', isoCode: 'GR', cuisineSlug: 'greek-cuisine', dishTypes: ['casserole', 'main-course'], methodSlug: 'fried-and-topped', wikipediaSlug: 'Moussaka' },
  { slug: 'cacio-e-pepe', canonicalName: 'Cacio e pepe', shortDescription: 'A Roman pasta made with just Pecorino Romano cheese and freshly ground black pepper tossed with hot pasta water and tonnarelli or spaghetti.', lat: 41.9028, lng: 12.4964, countryName: 'Italy', isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['pasta', 'main-course'], methodSlug: 'pasta', wikipediaSlug: 'Cacio_e_pepe' },
  { slug: 'pizza-margherita', canonicalName: 'Pizza Margherita', shortDescription: 'A Neapolitan pizza topped with San Marzano tomato sauce, fresh mozzarella, fresh basil, and olive oil. Named for Queen Margherita of Savoy in 1889.', lat: 40.8518, lng: 14.2681, countryName: 'Italy', isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['bread', 'main-course'], methodSlug: 'bread', wikipediaSlug: 'Pizza_Margherita' },
  { slug: 'paella-valenciana', canonicalName: 'Paella', shortDescription: 'A Valencian rice dish with saffron, olive oil, vegetables, and a choice of seafood, meat, or beans. Cooked in a wide, shallow pan over an open fire.', lat: 39.4699, lng: -0.3763, countryName: 'Spain', isoCode: 'ES', cuisineSlug: 'spanish-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Paella' },
  { slug: 'gazpacho', canonicalName: 'Gazpacho', shortDescription: 'A cold Andalusian soup made from raw blended vegetables — typically tomato, cucumber, pepper, garlic, olive oil, vinegar, and stale bread.', lat: 37.3891, lng: -5.9845, countryName: 'Spain', isoCode: 'ES', cuisineSlug: 'spanish-cuisine', dishTypes: ['soup', 'appetizer'], methodSlug: 'salad', wikipediaSlug: 'Gazpacho' },
  { slug: 'tarte-tatin', canonicalName: 'Tarte Tatin', shortDescription: 'An upside-down French tart in which apples are caramelised in butter and sugar beneath a pastry crust, then flipped when served.', lat: 47.9025, lng: 1.909, countryName: 'France', isoCode: 'FR', cuisineSlug: 'french-cuisine', dishTypes: ['dessert'], methodSlug: 'dessert', wikipediaSlug: 'Tarte_Tatin' },
  { slug: 'boeuf-bourguignon', canonicalName: 'Boeuf bourguignon', shortDescription: 'A French beef stew braised in red wine (traditionally Burgundy) with beef broth, bacon, onions, mushrooms, and a bouquet garni.', lat: 47.2805, lng: 4.9994, countryName: 'France', isoCode: 'FR', cuisineSlug: 'french-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Boeuf_bourguignon' },
  { slug: 'wiener-schnitzel', canonicalName: 'Wiener Schnitzel', shortDescription: 'A thin, breaded, pan-fried veal cutlet, traditionally served in Austria with a slice of lemon and either potato salad or parsley potatoes.', lat: 48.2082, lng: 16.3738, countryName: 'Austria', isoCode: 'AT', cuisineSlug: 'austrian-cuisine', dishTypes: ['main-course'], methodSlug: 'fried-and-topped', wikipediaSlug: 'Wiener_Schnitzel' },
  { slug: 'pierogi', canonicalName: 'Pierogi', shortDescription: 'Filled dumplings of unleavened dough, traditionally stuffed with potato, sauerkraut, meat, cheese, or fruit. A staple of Polish cuisine.', lat: 52.2297, lng: 21.0122, countryName: 'Poland', isoCode: 'PL', cuisineSlug: 'polish-cuisine', dishTypes: ['dumpling', 'main-course'], methodSlug: 'dumpling', wikipediaSlug: 'Pierogi' },
  { slug: 'goulash-hungarian', canonicalName: 'Goulash', shortDescription: 'A Hungarian soup or stew of meat and vegetables seasoned with paprika and other spices. The name derives from the Hungarian word gulyás, meaning \'herdsman\'.', lat: 47.4979, lng: 19.0402, countryName: 'Hungary', isoCode: 'HU', cuisineSlug: 'hungarian-cuisine', dishTypes: ['stew', 'soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Goulash' },
  { slug: 'ramen-japanese', canonicalName: 'Ramen', shortDescription: 'A Japanese noodle soup with wheat noodles in a meat- or fish-based broth, flavoured with soy sauce or miso and topped with ingredients like sliced pork, nori, and scallions.', lat: 35.6762, lng: 139.6503, countryName: 'Japan', isoCode: 'JP', cuisineSlug: 'japanese-cuisine', dishTypes: ['noodle-soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Ramen' },
  { slug: 'sushi', canonicalName: 'Sushi', shortDescription: 'A traditional Japanese dish of vinegared rice paired with various ingredients, most commonly raw seafood, vegetables, and sometimes tropical fruits.', lat: 35.6762, lng: 139.6503, countryName: 'Japan', isoCode: 'JP', cuisineSlug: 'japanese-cuisine', dishTypes: ['main-course'], methodSlug: 'boiled-and-cured', wikipediaSlug: 'Sushi' },
  { slug: 'pad-thai', canonicalName: 'Pad Thai', shortDescription: 'A stir-fried rice noodle dish from Thailand with eggs, vegetables, tofu or shrimp, peanuts, and a tangy sauce of tamarind, fish sauce, and palm sugar.', lat: 13.7563, lng: 100.5018, countryName: 'Thailand', isoCode: 'TH', cuisineSlug: 'thai-cuisine', dishTypes: ['stir-fry', 'noodle-soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Pad_Thai' },
  { slug: 'tom-yum', canonicalName: 'Tom Yum', shortDescription: 'A hot and sour Thai soup with shrimp, lemongrass, kaffir lime leaves, galangal, lime juice, fish sauce, and crushed chili peppers.', lat: 13.7563, lng: 100.5018, countryName: 'Thailand', isoCode: 'TH', cuisineSlug: 'thai-cuisine', dishTypes: ['soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Tom_yum' },
  { slug: 'pho-vietnamese', canonicalName: 'Phở', shortDescription: 'A Vietnamese noodle soup of bone broth, rice noodles, herbs, and meat (typically beef or chicken). Considered Vietnam\'s national dish.', lat: 21.0285, lng: 105.8542, countryName: 'Vietnam', isoCode: 'VN', cuisineSlug: 'vietnamese-cuisine', dishTypes: ['noodle-soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Ph%E1%BB%9F' },
  { slug: 'banh-mi', canonicalName: 'Bánh mì', shortDescription: 'A Vietnamese sandwich of a short baguette with grilled pork, pâté, pickled vegetables, fresh herbs, and chili. A legacy of French colonial rule.', lat: 21.0285, lng: 105.8542, countryName: 'Vietnam', isoCode: 'VN', cuisineSlug: 'vietnamese-cuisine', dishTypes: ['sandwich', 'main-course'], methodSlug: 'bread', wikipediaSlug: 'B%C3%A1nh_m%C3%AC' },
  { slug: 'hainanese-chicken-rice', canonicalName: 'Hainanese Chicken Rice', shortDescription: 'A dish of poached chicken served with seasoned rice cooked in chicken broth, accompanied by cucumber, chili sauce, and ginger paste.', lat: 1.3521, lng: 103.8198, countryName: 'Singapore', isoCode: 'SG', cuisineSlug: 'singaporean-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Hainanese_chicken_rice' },
  { slug: 'nasi-goreng', canonicalName: 'Nasi Goreng', shortDescription: 'An Indonesian fried rice dish cooked with kecap manis (sweet soy sauce), shallots, garlic, tamarind, and chilli, typically topped with a fried egg.', lat: -6.2088, lng: 106.8456, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['fried-rice', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Nasi_goreng' },
  { slug: 'bibimbap', canonicalName: 'Bibimbap', shortDescription: 'A Korean rice dish of steamed white rice topped with sautéed and seasoned vegetables, beef, a raw or fried egg, and gochujang (chilli paste).', lat: 37.5665, lng: 126.978, countryName: 'South Korea', isoCode: 'KR', cuisineSlug: 'korean-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Bibimbap' },
  { slug: 'kimchi-jjigae', canonicalName: 'Kimchi Jjigae', shortDescription: 'A Korean stew made with aged kimchi, pork or tuna, tofu, scallions, and gochujang, simmered together until bubbling and tangy.', lat: 37.5665, lng: 126.978, countryName: 'South Korea', isoCode: 'KR', cuisineSlug: 'korean-cuisine', dishTypes: ['stew', 'soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Kimchi_jjigae' },
  { slug: 'hummus', canonicalName: 'Hummus', shortDescription: 'A Levantine dip or spread made from cooked, mashed chickpeas blended with tahini, lemon juice, garlic, and olive oil.', lat: 31.7683, lng: 35.2137, countryName: 'Israel', isoCode: 'IL', cuisineSlug: 'israeli-cuisine', dishTypes: ['appetizer', 'sauce'], methodSlug: 'salad', wikipediaSlug: 'Hummus' },
  { slug: 'falafel', canonicalName: 'Falafel', shortDescription: 'Deep-fried balls or patties of ground chickpeas, fava beans, or both, mixed with herbs and spices. A staple of Middle Eastern street food.', lat: 31.7683, lng: 35.2137, countryName: 'Israel', isoCode: 'IL', cuisineSlug: 'israeli-cuisine', dishTypes: ['appetizer', 'main-course'], methodSlug: 'salad', wikipediaSlug: 'Falafel' },
  { slug: 'shawarma', canonicalName: 'Shawarma', shortDescription: 'A Middle Eastern dish of slow-roasted, thinly sliced meat (lamb, mutton, beef, chicken, or mixed) served in a flatbread with vegetables and tahini or yogurt sauce.', lat: 33.8938, lng: 35.5018, countryName: 'Lebanon', isoCode: 'LB', cuisineSlug: 'lebanese-cuisine', dishTypes: ['sandwich', 'main-course'], methodSlug: 'kebab', wikipediaSlug: 'Shawarma' },
  { slug: 'biryani-hyderabadi', canonicalName: 'Hyderabadi Biryani', shortDescription: 'A mixed rice dish of layered basmati rice, marinated meat (typically chicken, mutton, or goat), fried onions, saffron, and whole spices. The Hyderabadi version is among the most famous.', lat: 17.385, lng: 78.4867, countryName: 'India', isoCode: 'IN', cuisineSlug: 'indian-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Biryani' },
  { slug: 'chicken-tikka-masala', canonicalName: 'Chicken Tikka Masala', shortDescription: 'A dish of roasted marinated chicken chunks (chicken tikka) in a spiced, creamy tomato sauce. Often considered a British national dish due to its invention in Glasgow.', lat: 55.8642, lng: -4.2518, countryName: 'United Kingdom', isoCode: 'GB', cuisineSlug: 'british-cuisine', dishTypes: ['curry', 'main-course'], methodSlug: 'curry', wikipediaSlug: 'Chicken_tikka_masala' },
  { slug: 'feijoada', canonicalName: 'Feijoada', shortDescription: 'A Brazilian stew of black beans with pork and beef, served with rice, collard greens, farofa (toasted cassava flour), and orange slices.', lat: -22.9068, lng: -43.1729, countryName: 'Brazil', isoCode: 'BR', cuisineSlug: 'brazilian-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Feijoada' },
  { slug: 'ceviche-peruvian', canonicalName: 'Ceviche', shortDescription: 'A Peruvian dish of raw fish cured in fresh citrus juices (typically lime), spiced with ají or chili peppers, and seasoned with onions, salt, and cilantro.', lat: -12.0464, lng: -77.0428, countryName: 'Peru', isoCode: 'PE', cuisineSlug: 'peruvian-cuisine', dishTypes: ['appetizer', 'main-course'], methodSlug: 'boiled-and-cured', wikipediaSlug: 'Ceviche' },
  { slug: 'hamburger-american', canonicalName: 'Hamburger', shortDescription: 'A sandwich consisting of a cooked ground-meat patty (usually beef) between two pieces of bread or a bun. The modern form is most associated with the United States.', lat: 39.8283, lng: -98.5795, countryName: 'United States', isoCode: 'US', cuisineSlug: 'american-cuisine', dishTypes: ['sandwich', 'main-course'], methodSlug: 'bread', wikipediaSlug: 'Hamburger' },
  { slug: 'poutine', canonicalName: 'Poutine', shortDescription: 'A Québécois dish of french fries topped with cheese curds and hot gravy. Originated in rural Quebec in the 1950s.', lat: 46.8139, lng: -71.208, countryName: 'Canada', isoCode: 'CA', cuisineSlug: 'canadian-cuisine', dishTypes: ['main-course'], methodSlug: 'fried-and-topped', wikipediaSlug: 'Poutine' },
  { slug: 'tagine-moroccan', canonicalName: 'Tagine', shortDescription: 'A slow-cooked North African stew named after the conical clay pot in which it is cooked. Combines meat (typically lamb or chicken) with vegetables, fruits, and warming spices.', lat: 33.9716, lng: -6.8498, countryName: 'Morocco', isoCode: 'MA', cuisineSlug: 'moroccan-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Tagine' },
  { slug: 'jollof-rice', canonicalName: 'Jollof Rice', shortDescription: 'A West African one-pot rice dish of long-grain rice simmered in a tomato-and-red-pepper sauce with onions, garlic, ginger, thyme, and assorted proteins.', lat: 6.5244, lng: 3.3792, countryName: 'Nigeria', isoCode: 'NG', cuisineSlug: 'nigerian-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Jollof_rice' },
  { slug: 'babi-guling', canonicalName: 'Babi Guling', shortDescription: 'A Balinese whole-roasted suckling pig stuffed with a spice paste of turmeric, coriander, galangal, garlic, and chili, spit-roasted over coconut husk fire until the skin crackles.', lat: -8.4095, lng: 115.1889, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['main-course', 'kebab'], methodSlug: 'kebab', wikipediaSlug: 'Babi_guling' },
  { slug: 'rendang', canonicalName: 'Rendang', shortDescription: 'A West Sumatran dry curry of beef slow-cooked for hours in coconut milk and a paste of ginger, galangal, turmeric, chili, lemongrass, garlic, and shallots until the sauce fully reduces and the meat darkens.', lat: -0.7893, lng: 100.6544, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['curry', 'stew', 'main-course'], methodSlug: 'curry', wikipediaSlug: 'Rendang' },
  { slug: 'soto-ayam', canonicalName: 'Soto Ayam', shortDescription: 'An Indonesian clear chicken soup fragrant with turmeric, lemongrass, and lime leaves, served with rice or vermicelli, shredded chicken, boiled egg, bean sprouts, and crispy shallots.', lat: -6.2088, lng: 106.8456, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Soto_ayam' },
  { slug: 'rawon', canonicalName: 'Rawon', shortDescription: 'An East Javanese beef soup with a deep black color from keluak nuts, seasoned with garlic, shallots, ginger, turmeric, and aromatic leaves.', lat: -7.2459, lng: 112.7378, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Rawon' },
  { slug: 'gado-gado', canonicalName: 'Gado-Gado', shortDescription: 'An Indonesian salad of blanched and steamed vegetables, hard-boiled egg, fried tofu, and lontong, dressed in a peanut sauce sweetened with palm sugar and spiked with chili and tamarind.', lat: -6.1751, lng: 106.865, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['salad', 'main-course'], methodSlug: 'salad', wikipediaSlug: 'Gado-gado' },
  { slug: 'pempek', canonicalName: 'Pempek', shortDescription: 'Palembang fish cakes made from ground mackerel or other white fish mixed with tapioca flour, formed into logs or balls, boiled, sliced, and fried, served with a sweet-sour-spicy cuko sauce.', lat: -2.9909, lng: 104.7567, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['appetizer', 'main-course'], methodSlug: 'salad', wikipediaSlug: 'Pempek' },
  { slug: 'nasi-campur-bali', canonicalName: 'Nasi Campur Bali', shortDescription: 'A Balinese rice plate featuring a small mound of white rice surrounded by several small portions: a meat or fish, vegetables, peanut sauce, fried shallots, shredded coconut, sambal, and a small portion of lawar.', lat: -8.65, lng: 115.2167, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Nasi_campur' },
  { slug: 'sate-lilit', canonicalName: 'Sate Lilit', shortDescription: 'A Balinese minced-meat satay: finely ground pork, chicken, or fish mixed with grated coconut, coconut milk, lime leaves, lemongrass, and spices, molded around bamboo skewers and grilled over coconut charcoal.', lat: -8.5069, lng: 115.2625, countryName: 'Indonesia', isoCode: 'ID', cuisineSlug: 'indonesian-cuisine', dishTypes: ['kebab', 'appetizer'], methodSlug: 'kebab', wikipediaSlug: 'Sate_lilit' },
  { slug: 'laksa', canonicalName: 'Laksa', shortDescription: 'A spicy noodle soup of Peranakan and broader Southeast Asian origin: rice vermicelli or thick wheat noodles in a fragrant broth built from lemongrass, galangal, candlenuts, turmeric, and dried shrimp, topped with bean sprouts, prawns, and hard-boiled egg.', lat: 1.3521, lng: 103.8198, countryName: 'Singapore', isoCode: 'SG', cuisineSlug: 'singaporean-cuisine', dishTypes: ['noodle-soup', 'soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Laksa' },
  { slug: 'khao-soi', canonicalName: 'Khao Soi', shortDescription: 'A Northern Thai coconut-curry noodle soup of soft egg noodles in a turmeric-and-chili coconut broth, topped with crispy fried noodles, chicken or beef, pickled mustard greens, shallots, and lime.', lat: 18.7883, lng: 98.9853, countryName: 'Thailand', isoCode: 'TH', cuisineSlug: 'northern-thai-cuisine', dishTypes: ['noodle-soup', 'curry', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Khao_soi' },
  { slug: 'udon', canonicalName: 'Udon', shortDescription: 'Thick Japanese wheat noodles served in a light dashi-based broth, often with toppings such as tempura, sliced scallion, or a soft-boiled egg. Related to ramen but chewier and usually served in a milder broth.', lat: 34.6937, lng: 135.5023, countryName: 'Japan', isoCode: 'JP', cuisineSlug: 'japanese-cuisine', dishTypes: ['noodle-soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Udon' },
  { slug: 'mapo-tofu', canonicalName: 'Mapo Tofu', shortDescription: 'A Sichuan dish of silken tofu simmered in a fiery red sauce of fermented broad-bean paste (doubanjiang), ground pork or beef, douchi, Sichuan peppercorns, chili oil, and scallions.', lat: 30.5728, lng: 104.0668, countryName: 'China', isoCode: 'CN', cuisineSlug: 'chinese-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'poached-in-sauce', wikipediaSlug: 'Mapo_tofu' },
  { slug: 'congee', canonicalName: 'Congee', shortDescription: 'A long-simmered rice porridge eaten across East and Southeast Asia, served plain or with pickles, century egg, shredded pork, fish, or scallions. Cantonese jook, Japanese okayu, and Indonesian bubur are all forms.', lat: 23.1291, lng: 113.2644, countryName: 'China', isoCode: 'CN', cuisineSlug: 'chinese-cuisine', dishTypes: ['soup', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Congee' },
  { slug: 'jiaozi', canonicalName: 'Jiaozi', shortDescription: 'Northern Chinese crescent-shaped dumplings with a thin wheat-flour wrapper and a filling of ground pork, cabbage, ginger, scallions, and soy sauce. Boiled (shuijiao), steamed (zhengjiao), or pan-fried (guotie).', lat: 39.9042, lng: 116.4074, countryName: 'China', isoCode: 'CN', cuisineSlug: 'chinese-cuisine', dishTypes: ['dumpling', 'main-course'], methodSlug: 'dumpling', wikipediaSlug: 'Jiaozi' },
  { slug: 'japchae', canonicalName: 'Japchae', shortDescription: 'A Korean stir-fried glass-noodle dish made from sweet-potato starch noodles tossed with beef, spinach, mushrooms, carrots, and onion in a sesame-oil and soy sauce dressing.', lat: 37.5665, lng: 126.978, countryName: 'South Korea', isoCode: 'KR', cuisineSlug: 'korean-cuisine', dishTypes: ['stir-fry', 'noodle-soup', 'main-course'], methodSlug: 'noodle-soup', wikipediaSlug: 'Japchae' },
  { slug: 'dosa', canonicalName: 'Dosa', shortDescription: 'A thin, crispy South Indian crepe made from a fermented batter of rice and urad dal, served with coconut chutney and sambar. Sambar is closely related to the rasam and other lentil-stew traditions of the Deccan.', lat: 13.0827, lng: 80.2707, countryName: 'India', isoCode: 'IN', cuisineSlug: 'south-indian-cuisine', dishTypes: ['pancake', 'main-course'], methodSlug: 'pancake', wikipediaSlug: 'Dosa' },
  { slug: 'vindaloo', canonicalName: 'Vindaloo', shortDescription: 'A Goan curry of Portuguese origin: meat (traditionally pork) marinated in vinegar, garlic, and Kashmiri chili, then cooked with onions, ginger, and warm spices. The Portuguese carne de vinha d\'alhos became vindaloo over centuries.', lat: 15.2993, lng: 74.124, countryName: 'India', isoCode: 'IN', cuisineSlug: 'goan-cuisine', dishTypes: ['curry', 'main-course'], methodSlug: 'curry', wikipediaSlug: 'Vindaloo' },
  { slug: 'momo', canonicalName: 'Momo', shortDescription: 'A Himalayan steamed dumpling of Tibetan origin, made from a thin wheat-flour wrapper and a filling of ground meat or vegetables. Now widely eaten across Nepal, Sikkim, Bhutan, and the Tibetan diaspora.', lat: 27.7172, lng: 85.324, countryName: 'Nepal', isoCode: 'NP', cuisineSlug: 'nepali-cuisine', dishTypes: ['dumpling', 'appetizer'], methodSlug: 'dumpling', wikipediaSlug: 'Momo_(dumpling)' },
  { slug: 'risotto-alla-milanese', canonicalName: 'Risotto alla Milanese', shortDescription: 'A Northern Italian short-grain rice dish cooked in a bone-marrow-enriched beef broth with saffron and onions, giving it a deep yellow color and a faintly metallic, floral finish.', lat: 45.4642, lng: 9.19, countryName: 'Italy', isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['rice-dish', 'main-course'], methodSlug: 'fried-rice', wikipediaSlug: 'Risotto_alla_milanese' },
  { slug: 'couscous', canonicalName: 'Couscous', shortDescription: 'Tiny steamed semolina grains of Maghrebi origin, served beneath or alongside a stew of meat (typically lamb or chicken) and vegetables flavored with ras el hanout, saffron, and preserved lemon.', lat: 36.8065, lng: 10.1815, countryName: 'Tunisia', isoCode: 'TN', cuisineSlug: 'maghrebi-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Couscous' },
  { slug: 'shakshuka', canonicalName: 'Shakshuka', shortDescription: 'Eggs poached in a spiced sauce of tomatoes, peppers, onions, garlic, and chili. Origin disputed between North African and Levantine kitchens; eaten across Israel, Tunisia, Libya, and the Maghreb.', lat: 32.0853, lng: 34.7818, countryName: 'Israel', isoCode: 'IL', cuisineSlug: 'israeli-cuisine', dishTypes: ['main-course'], methodSlug: 'poached-in-sauce', wikipediaSlug: 'Shakshuka' },
  { slug: 'mansaf', canonicalName: 'Mansaf', shortDescription: 'The national dish of Jordan: lamb cooked in a fermented dried-yogurt sauce (jameed) and served over a flatbread (shrak) topped with rice and almonds. Central to Bedouin hospitality.', lat: 31.9454, lng: 35.9284, countryName: 'Jordan', isoCode: 'JO', cuisineSlug: 'jordanian-cuisine', dishTypes: ['stew', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Mansaf' },
  { slug: 'borscht', canonicalName: 'Borscht', shortDescription: 'A sour soup of Eastern European origin built on beetroots, which give it a deep red color, combined with cabbage, potatoes, carrots, onion, and a meat broth. Often served with sour cream and pampushky.', lat: 50.4501, lng: 30.5234, countryName: 'Ukraine', isoCode: 'UA', cuisineSlug: 'ukrainian-cuisine', dishTypes: ['soup', 'main-course'], methodSlug: 'stew', wikipediaSlug: 'Borscht' },
  { slug: 'bacalhau-a-bras', canonicalName: 'Bacalhau à Brás', shortDescription: 'A Portuguese dish of shredded salt cod stir-fried with onions, matchstick potatoes, parsley, olives, and eggs, finished with black olives and a squeeze of lemon.', lat: 38.7223, lng: -9.1393, countryName: 'Portugal', isoCode: 'PT', cuisineSlug: 'portuguese-cuisine', dishTypes: ['stir-fry', 'main-course'], methodSlug: 'omelettes-and-scrambles', wikipediaSlug: 'Bacalhau_%C3%A0_Br%C3%A1s' },
  { slug: 'tiramisu', canonicalName: 'Tiramisù', shortDescription: 'A layered Italian dessert of espresso-soaked savoiardi biscuits and a mascarpone cream, dusted with cocoa. Origins contested between Veneto and Friuli-Venezia Giulia; emerged in its modern form in the 1960s–80s.', lat: 45.4408, lng: 12.3155, countryName: 'Italy', isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['dessert'], methodSlug: 'dessert', wikipediaSlug: 'Tiramis%C3%B9' },
  { slug: 'tamales', canonicalName: 'Tamales', shortDescription: 'Masa (nixtamalized corn dough) filled with meat, cheese, beans, or chilies, wrapped in a corn husk or banana leaf and steamed. Found across Mexico, Guatemala, and much of Central America; deeply rooted in Mesoamerican cooking.', lat: 19.4326, lng: -99.1332, countryName: 'Mexico', isoCode: 'MX', cuisineSlug: 'mexican-cuisine', dishTypes: ['main-course', 'appetizer'], methodSlug: 'steamed-and-custard', wikipediaSlug: 'Tamale' },
  { slug: 'empanada', canonicalName: 'Empanada', shortDescription: 'A baked or fried pastry turnover filled with seasoned meat, cheese, or vegetables. Found across Latin America from Argentina to the Philippines, each region claiming its own folded style and filling.', lat: -34.6037, lng: -58.3816, countryName: 'Argentina', isoCode: 'AR', cuisineSlug: 'argentine-cuisine', dishTypes: ['appetizer', 'main-course'], methodSlug: 'dumpling', wikipediaSlug: 'Empanada' },
  { slug: 'tostones', canonicalName: 'Tostones', shortDescription: 'Twice-fried green-plantain slices, flattened between fryings. A staple across the Caribbean and Latin American coastlines, served as a side or snack, often with garlic mojo or a saltfish topping.', lat: 18.4655, lng: -66.1057, countryName: 'Puerto Rico', isoCode: 'PR', cuisineSlug: 'caribbean-cuisine', dishTypes: ['appetizer', 'side'], methodSlug: 'salad', wikipediaSlug: 'Tostones' },
  { slug: 'acaraje', canonicalName: 'Acarajé', shortDescription: 'A Bahian (Brazilian) street food of black-eyed pea fritters split open and stuffed with vatapá (a shrimp and peanut paste), dried shrimp, and a bright salad of tomato, onion, and cilantro.', lat: -12.9714, lng: -38.5014, countryName: 'Brazil', isoCode: 'BR', cuisineSlug: 'bahian-cuisine', dishTypes: ['appetizer', 'street-snack'], methodSlug: 'salad', wikipediaSlug: 'Acaraj%C3%A9' },
];

const CUISINE_MAP = {
  'american-cuisine': { name: 'American cuisine' },
  'argentine-cuisine': { name: 'Argentine cuisine' },
  'austrian-cuisine': { name: 'Austrian cuisine' },
  'bahian-cuisine': { name: 'Bahian cuisine' },
  'brazilian-cuisine': { name: 'Brazilian cuisine' },
  'british-cuisine': { name: 'British cuisine' },
  'canadian-cuisine': { name: 'Canadian cuisine' },
  'caribbean-cuisine': { name: 'Caribbean cuisine' },
  'chinese-cuisine': { name: 'Chinese cuisine' },
  'french-cuisine': { name: 'French cuisine' },
  'goan-cuisine': { name: 'Goan cuisine' },
  'greek-cuisine': { name: 'Greek cuisine' },
  'hungarian-cuisine': { name: 'Hungarian cuisine' },
  'indian-cuisine': { name: 'Indian cuisine' },
  'indonesian-cuisine': { name: 'Indonesian cuisine' },
  'israeli-cuisine': { name: 'Israeli cuisine' },
  'italian-cuisine': { name: 'Italian cuisine' },
  'japanese-cuisine': { name: 'Japanese cuisine' },
  'jordanian-cuisine': { name: 'Jordanian cuisine' },
  'korean-cuisine': { name: 'Korean cuisine' },
  'lebanese-cuisine': { name: 'Lebanese cuisine' },
  'maghrebi-cuisine': { name: 'Maghrebi cuisine' },
  'mexican-cuisine': { name: 'Mexican cuisine' },
  'moroccan-cuisine': { name: 'Moroccan cuisine' },
  'nepali-cuisine': { name: 'Nepali cuisine' },
  'nigerian-cuisine': { name: 'Nigerian cuisine' },
  'northern-thai-cuisine': { name: 'Northern Thai cuisine' },
  'peruvian-cuisine': { name: 'Peruvian cuisine' },
  'polish-cuisine': { name: 'Polish cuisine' },
  'portuguese-cuisine': { name: 'Portuguese cuisine' },
  'singaporean-cuisine': { name: 'Singaporean cuisine' },
  'south-indian-cuisine': { name: 'South Indian cuisine' },
  'spanish-cuisine': { name: 'Spanish cuisine' },
  'thai-cuisine': { name: 'Thai cuisine' },
  'ukrainian-cuisine': { name: 'Ukrainian cuisine' },
  'vietnamese-cuisine': { name: 'Vietnamese cuisine' },
};

// ─── Response builders ─────────────────────────────────────────────────────

function buildDishList() {
  return {
    dishes: DISHES.map((d) => ({
      id: `mock-${d.slug}`,
      slug: d.slug,
      canonicalName: d.canonicalName,
      shortDescription: d.shortDescription,
      status: 'published',
      originGeoId: `mock-geo-${d.isoCode.toLowerCase()}`,
      originName: d.countryName,
      methodSlug: d.methodSlug,
      viewCount: 0,
      updatedAt: new Date().toISOString(),
    })),
    limit: 100,
    offset: 0,
  };
}

function buildDishDetail(slug) {
  const dish = DISHES.find((d) => d.slug === slug);
  if (!dish) return null;

  const cuisine = CUISINE_MAP[dish.cuisineSlug];

  return {
    dish: {
      id: `mock-${dish.slug}`,
      canonicalName: dish.canonicalName,
      slug: dish.slug,
      shortDescription: dish.shortDescription,
      longDescription: null,
      originGeoId: null,
      originLocation: null,
      originDateEarliest: null,
      originDateLatest: null,
      status: 'published',
      viewCount: 0,
      editCount: 0,
      contributorCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      lastEditedBy: null,
      name: dish.canonicalName,
      description: dish.shortDescription,
    },
    origin: {
      id: `mock-geo-${dish.isoCode.toLowerCase()}`,
      name: dish.countryName,
      localName: null,
      isoCode: dish.isoCode,
      entityType: 'country',
      lat: dish.lat,
      lng: dish.lng,
    },
    variants: [],
    ingredients: [],
    tags: [],
    categories: [
      ...(cuisine
        ? [{
            categoryId: `mock-cuisine-${dish.cuisineSlug}`,
            name: cuisine.name,
            slug: dish.cuisineSlug,
            isPrimary: true,
          }]
        : []),
      ...dish.dishTypes.map((t, i) => ({
        categoryId: `mock-type-${t}`,
        name: t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        slug: t,
        isPrimary: i === 0,
      })),
    ],
    preparations: [],
    sources: [
      {
        id: `mock-src-${dish.slug}`,
        claimText: null,
        location: null,
        addedAt: new Date().toISOString(),
        sourceId: `mock-src-${dish.slug}`,
        sourceType: 'wikipedia',
        title: dish.canonicalName,
        authors: 'Wikipedia',
        year: null,
        publisher: 'Wikipedia',
        url: `https://en.wikipedia.org/wiki/${dish.wikipediaSlug}`,
        citationText: null,
        language: 'en',
        reliability: 'high',
      },
    ],
    media: [],
    coverImage: null,
    availableLanguages: ['en'],
  };
}

// ─── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // CORS headers (not strictly needed for Astro SSG, but harmless).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // GET /api/dishes — list all published dishes
  if (url.pathname === '/api/dishes' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(buildDishList()));
    return;
  }

  // GET /api/dishes/map — map data
  if (url.pathname === '/api/dishes/map' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      dishes: DISHES.map((d) => ({
        slug: d.slug,
        canonicalName: d.canonicalName,
        shortDescription: d.shortDescription,
        viewCount: 0,
        lat: d.lat,
        lng: d.lng,
        region: {
          name: d.countryName,
          localName: null,
          isoCode: d.isoCode,
          entityType: 'country',
        },
      })),
      count: DISHES.length,
    }));
    return;
  }

  // GET /api/dishes/:slug — dish detail
  const slugMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)$/);
  if (slugMatch && req.method === 'GET') {
    const detail = buildDishDetail(slugMatch[1]);
    if (detail) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(detail));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', message: `No dish with slug "${slugMatch[1]}"` }));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', message: `Unknown route: ${url.pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
  console.log(`[mock-api] ${DISHES.length} dishes loaded`);
});
