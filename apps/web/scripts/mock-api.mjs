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
 * getStaticPaths and getDishDetail to generate all 31 dish pages.
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
  // Europe
  { slug: 'moussaka-greek',          canonicalName: 'Moussaka',            shortDescription: 'A layered casserole of fried eggplant, spiced minced meat, and béchamel sauce, baked until golden. Considered the national dish of Greece.',                                      lat: 39.0742, lng: 21.8243, countryName: 'Greece',            isoCode: 'GR', cuisineSlug: 'greek-cuisine',  dishTypes: ['casserole','main-course'], wikipediaSlug: 'Moussaka' },
  { slug: 'cacio-e-pepe',            canonicalName: 'Cacio e pepe',        shortDescription: 'A Roman pasta made with just Pecorino Romano cheese and freshly ground black pepper tossed with hot pasta water and tonnarelli or spaghetti.',                                        lat: 41.9028, lng: 12.4964, countryName: 'Italy',              isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['pasta','main-course'],    wikipediaSlug: 'Cacio_e_pepe' },
  { slug: 'pizza-margherita',        canonicalName: 'Pizza Margherita',    shortDescription: 'A Neapolitan pizza topped with San Marzano tomato sauce, fresh mozzarella, fresh basil, and olive oil. Named for Queen Margherita of Savoy in 1889.',                                    lat: 40.8518, lng: 14.2681, countryName: 'Italy',              isoCode: 'IT', cuisineSlug: 'italian-cuisine', dishTypes: ['bread','main-course'],    wikipediaSlug: 'Pizza_Margherita' },
  { slug: 'paella-valenciana',       canonicalName: 'Paella',              shortDescription: 'A Valencian rice dish with saffron, olive oil, vegetables, and a choice of seafood, meat, or beans. Cooked in a wide, shallow pan over an open fire.',                                  lat: 39.4699, lng: -0.3763, countryName: 'Spain',              isoCode: 'ES', cuisineSlug: 'spanish-cuisine', dishTypes: ['rice-dish','main-course'], wikipediaSlug: 'Paella' },
  { slug: 'gazpacho',                canonicalName: 'Gazpacho',            shortDescription: 'A cold Andalusian soup made from raw blended vegetables — typically tomato, cucumber, pepper, garlic, olive oil, vinegar, and stale bread.',                                                   lat: 37.3891, lng: -5.9845, countryName: 'Spain',              isoCode: 'ES', cuisineSlug: 'spanish-cuisine', dishTypes: ['soup','appetizer'],       wikipediaSlug: 'Gazpacho' },
  { slug: 'tarte-tatin',             canonicalName: 'Tarte Tatin',         shortDescription: 'An upside-down French tart in which apples are caramelised in butter and sugar beneath a pastry crust, then flipped when served.',                                                       lat: 47.9025, lng: 1.9090,  countryName: 'France',             isoCode: 'FR', cuisineSlug: 'french-cuisine',  dishTypes: ['dessert'],                wikipediaSlug: 'Tarte_Tatin' },
  { slug: 'boeuf-bourguignon',       canonicalName: 'Boeuf bourguignon',   shortDescription: 'A French beef stew braised in red wine (traditionally Burgundy) with beef broth, bacon, onions, mushrooms, and a bouquet garni.',                                                        lat: 47.2805, lng: 4.9994,  countryName: 'France',             isoCode: 'FR', cuisineSlug: 'french-cuisine',  dishTypes: ['stew','main-course'],     wikipediaSlug: 'Boeuf_bourguignon' },
  { slug: 'wiener-schnitzel',        canonicalName: 'Wiener Schnitzel',    shortDescription: 'A thin, breaded, pan-fried veal cutlet, traditionally served in Austria with a slice of lemon and either potato salad or parsley potatoes.',                                              lat: 48.2082, lng: 16.3738, countryName: 'Austria',            isoCode: 'AT', cuisineSlug: 'austrian-cuisine',dishTypes: ['main-course'],            wikipediaSlug: 'Wiener_Schnitzel' },
  { slug: 'pierogi',                 canonicalName: 'Pierogi',             shortDescription: 'Filled dumplings of unleavened dough, traditionally stuffed with potato, sauerkraut, meat, cheese, or fruit. A staple of Polish cuisine.',                                                  lat: 52.2297, lng: 21.0122, countryName: 'Poland',             isoCode: 'PL', cuisineSlug: 'polish-cuisine', dishTypes: ['dumpling','main-course'], wikipediaSlug: 'Pierogi' },
  { slug: 'goulash-hungarian',      canonicalName: 'Goulash',             shortDescription: 'A Hungarian soup or stew of meat and vegetables seasoned with paprika and other spices. The name derives from the Hungarian word gulyás, meaning "herdsman".',                              lat: 47.4979, lng: 19.0402, countryName: 'Hungary',            isoCode: 'HU', cuisineSlug: 'hungarian-cuisine',dishTypes: ['stew','soup','main-course'], wikipediaSlug: 'Goulash' },
  // East & Southeast Asia
  { slug: 'ramen-japanese',          canonicalName: 'Ramen',               shortDescription: 'A Japanese noodle soup with wheat noodles in a meat- or fish-based broth, flavoured with soy sauce or miso and topped with ingredients like sliced pork, nori, and scallions.',           lat: 35.6762, lng: 139.6503, countryName: 'Japan',              isoCode: 'JP', cuisineSlug: 'japanese-cuisine',dishTypes: ['noodle-soup','main-course'], wikipediaSlug: 'Ramen' },
  { slug: 'sushi',                   canonicalName: 'Sushi',               shortDescription: 'A traditional Japanese dish of vinegared rice paired with various ingredients, most commonly raw seafood, vegetables, and sometimes tropical fruits.',                                        lat: 35.6762, lng: 139.6503, countryName: 'Japan',              isoCode: 'JP', cuisineSlug: 'japanese-cuisine',dishTypes: ['main-course'],            wikipediaSlug: 'Sushi' },
  { slug: 'pad-thai',                canonicalName: 'Pad Thai',            shortDescription: 'A stir-fried rice noodle dish from Thailand with eggs, vegetables, tofu or shrimp, peanuts, and a tangy sauce of tamarind, fish sauce, and palm sugar.',                                     lat: 13.7563, lng: 100.5018, countryName: 'Thailand',           isoCode: 'TH', cuisineSlug: 'thai-cuisine',    dishTypes: ['stir-fry','noodle-soup','main-course'], wikipediaSlug: 'Pad_Thai' },
  { slug: 'tom-yum',                 canonicalName: 'Tom Yum',             shortDescription: 'A hot and sour Thai soup with shrimp, lemongrass, kaffir lime leaves, galangal, lime juice, fish sauce, and crushed chili peppers.',                                                       lat: 13.7563, lng: 100.5018, countryName: 'Thailand',           isoCode: 'TH', cuisineSlug: 'thai-cuisine',    dishTypes: ['soup','main-course'],     wikipediaSlug: 'Tom_yum' },
  { slug: 'pho-vietnamese',          canonicalName: 'Phở',                 shortDescription: 'A Vietnamese noodle soup of bone broth, rice noodles, herbs, and meat (typically beef or chicken). Considered Vietnam\'s national dish.',                                                  lat: 21.0285, lng: 105.8542, countryName: 'Vietnam',            isoCode: 'VN', cuisineSlug: 'vietnamese-cuisine',dishTypes: ['noodle-soup','main-course'], wikipediaSlug: 'Ph%E1%BB%9F' },
  { slug: 'banh-mi',                 canonicalName: 'Bánh mì',             shortDescription: 'A Vietnamese sandwich of a short baguette with grilled pork, pâté, pickled vegetables, fresh herbs, and chili. A legacy of French colonial rule.',                                        lat: 21.0285, lng: 105.8542, countryName: 'Vietnam',            isoCode: 'VN', cuisineSlug: 'vietnamese-cuisine',dishTypes: ['sandwich','main-course'],  wikipediaSlug: 'B%C3%A1nh_m%C3%AC' },
  { slug: 'hainanese-chicken-rice',  canonicalName: 'Hainanese Chicken Rice', shortDescription: 'A dish of poached chicken served with seasoned rice cooked in chicken broth, accompanied by cucumber, chili sauce, and ginger paste.',                                                  lat: 1.3521,  lng: 103.8198, countryName: 'Singapore',          isoCode: 'SG', cuisineSlug: 'singaporean-cuisine',dishTypes: ['rice-dish','main-course'], wikipediaSlug: 'Hainanese_chicken_rice' },
  { slug: 'nasi-goreng',             canonicalName: 'Nasi Goreng',         shortDescription: 'An Indonesian fried rice dish cooked with kecap manis (sweet soy sauce), shallots, garlic, tamarind, and chilli, typically topped with a fried egg.',                                        lat: -6.2088, lng: 106.8456, countryName: 'Indonesia',          isoCode: 'ID', cuisineSlug: 'indonesian-cuisine',dishTypes: ['fried-rice','main-course'], wikipediaSlug: 'Nasi_goreng' },
  { slug: 'bibimbap',                canonicalName: 'Bibimbap',            shortDescription: 'A Korean rice dish of steamed white rice topped with sautéed and seasoned vegetables, beef, a raw or fried egg, and gochujang (chilli paste).',                                               lat: 37.5665, lng: 126.9780, countryName: 'South Korea',        isoCode: 'KR', cuisineSlug: 'korean-cuisine',  dishTypes: ['rice-dish','main-course'], wikipediaSlug: 'Bibimbap' },
  { slug: 'kimchi-jjigae',           canonicalName: 'Kimchi Jjigae',       shortDescription: 'A Korean stew made with aged kimchi, pork or tuna, tofu, scallions, and gochujang, simmered together until bubbling and tangy.',                                                          lat: 37.5665, lng: 126.9780, countryName: 'South Korea',        isoCode: 'KR', cuisineSlug: 'korean-cuisine',  dishTypes: ['stew','soup','main-course'], wikipediaSlug: 'Kimchi_jjigae' },
  // Middle East & South Asia
  { slug: 'hummus',                  canonicalName: 'Hummus',              shortDescription: 'A Levantine dip or spread made from cooked, mashed chickpeas blended with tahini, lemon juice, garlic, and olive oil.',                                                                 lat: 31.7683, lng: 35.2137,  countryName: 'Israel',             isoCode: 'IL', cuisineSlug: 'israeli-cuisine', dishTypes: ['appetizer','sauce'],      wikipediaSlug: 'Hummus' },
  { slug: 'falafel',                 canonicalName: 'Falafel',             shortDescription: 'Deep-fried balls or patties of ground chickpeas, fava beans, or both, mixed with herbs and spices. A staple of Middle Eastern street food.',                                               lat: 31.7683, lng: 35.2137,  countryName: 'Israel',             isoCode: 'IL', cuisineSlug: 'israeli-cuisine', dishTypes: ['appetizer','main-course'], wikipediaSlug: 'Falafel' },
  { slug: 'shawarma',                canonicalName: 'Shawarma',            shortDescription: 'A Middle Eastern dish of slow-roasted, thinly sliced meat (lamb, mutton, beef, chicken, or mixed) served in a flatbread with vegetables and tahini or yogurt sauce.',                       lat: 33.8938, lng: 35.5018,  countryName: 'Lebanon',            isoCode: 'LB', cuisineSlug: 'lebanese-cuisine',dishTypes: ['sandwich','main-course'],  wikipediaSlug: 'Shawarma' },
  { slug: 'biryani-hyderabadi',      canonicalName: 'Hyderabadi Biryani',  shortDescription: 'A mixed rice dish of layered basmati rice, marinated meat (typically chicken, mutton, or goat), fried onions, saffron, and whole spices. The Hyderabadi version is among the most famous.',  lat: 17.3850, lng: 78.4867,  countryName: 'India',              isoCode: 'IN', cuisineSlug: 'indian-cuisine', dishTypes: ['rice-dish','main-course'], wikipediaSlug: 'Biryani' },
  { slug: 'chicken-tikka-masala',    canonicalName: 'Chicken Tikka Masala', shortDescription: 'A dish of roasted marinated chicken chunks (chicken tikka) in a spiced, creamy tomato sauce. Often considered a British national dish due to its invention in Glasgow.',                 lat: 55.8642, lng: -4.2518,  countryName: 'United Kingdom',     isoCode: 'GB', cuisineSlug: 'british-cuisine', dishTypes: ['curry','main-course'],    wikipediaSlug: 'Chicken_tikka_masala' },
  // Americas
  { slug: 'feijoada',                canonicalName: 'Feijoada',            shortDescription: 'A Brazilian stew of black beans with pork and beef, served with rice, collard greens, farofa (toasted cassava flour), and orange slices.',                                                  lat: -22.9068,lng: -43.1729,  countryName: 'Brazil',             isoCode: 'BR', cuisineSlug: 'brazilian-cuisine',dishTypes: ['stew','main-course'],     wikipediaSlug: 'Feijoada' },
  { slug: 'ceviche-peruvian',        canonicalName: 'Ceviche',             shortDescription: 'A Peruvian dish of raw fish cured in fresh citrus juices (typically lime), spiced with ají or chili peppers, and seasoned with onions, salt, and cilantro.',                                lat: -12.0464,lng: -77.0428,  countryName: 'Peru',               isoCode: 'PE', cuisineSlug: 'peruvian-cuisine',dishTypes: ['appetizer','main-course'], wikipediaSlug: 'Ceviche' },
  { slug: 'hamburger-american',      canonicalName: 'Hamburger',           shortDescription: 'A sandwich consisting of a cooked ground-meat patty (usually beef) between two pieces of bread or a bun. The modern form is most associated with the United States.',                       lat: 39.8283, lng: -98.5795,  countryName: 'United States',      isoCode: 'US', cuisineSlug: 'american-cuisine',dishTypes: ['sandwich','main-course'],  wikipediaSlug: 'Hamburger' },
  { slug: 'poutine',                 canonicalName: 'Poutine',             shortDescription: 'A Québécois dish of french fries topped with cheese curds and hot gravy. Originated in rural Quebec in the 1950s.',                                                                      lat: 46.8139, lng: -71.2080,  countryName: 'Canada',             isoCode: 'CA', cuisineSlug: 'canadian-cuisine',dishTypes: ['main-course'],            wikipediaSlug: 'Poutine' },
  // Africa
  { slug: 'tagine-moroccan',        canonicalName: 'Tagine',              shortDescription: 'A slow-cooked North African stew named after the conical clay pot in which it is cooked. Combines meat (typically lamb or chicken) with vegetables, fruits, and warming spices.',              lat: 33.9716, lng: -6.8498,  countryName: 'Morocco',            isoCode: 'MA', cuisineSlug: 'moroccan-cuisine',dishTypes: ['stew','main-course'],     wikipediaSlug: 'Tagine' },
  { slug: 'jollof-rice',             canonicalName: 'Jollof Rice',         shortDescription: 'A West African one-pot rice dish of long-grain rice simmered in a tomato-and-red-pepper sauce with onions, garlic, ginger, thyme, and assorted proteins.',                                     lat: 6.5244,  lng: 3.3792,   countryName: 'Nigeria',            isoCode: 'NG', cuisineSlug: 'nigerian-cuisine',dishTypes: ['rice-dish','main-course'], wikipediaSlug: 'Jollof_rice' },
];

const CUISINE_MAP = {
  'greek-cuisine':       { name: 'Greek cuisine' },
  'italian-cuisine':     { name: 'Italian cuisine' },
  'spanish-cuisine':     { name: 'Spanish cuisine' },
  'french-cuisine':      { name: 'French cuisine' },
  'austrian-cuisine':    { name: 'Austrian cuisine' },
  'polish-cuisine':      { name: 'Polish cuisine' },
  'hungarian-cuisine':   { name: 'Hungarian cuisine' },
  'japanese-cuisine':    { name: 'Japanese cuisine' },
  'thai-cuisine':        { name: 'Thai cuisine' },
  'vietnamese-cuisine':  { name: 'Vietnamese cuisine' },
  'singaporean-cuisine': { name: 'Singaporean cuisine' },
  'indonesian-cuisine':  { name: 'Indonesian cuisine' },
  'korean-cuisine':      { name: 'Korean cuisine' },
  'israeli-cuisine':     { name: 'Israeli cuisine' },
  'lebanese-cuisine':    { name: 'Lebanese cuisine' },
  'indian-cuisine':      { name: 'Indian cuisine' },
  'british-cuisine':     { name: 'British cuisine' },
  'brazilian-cuisine':   { name: 'Brazilian cuisine' },
  'peruvian-cuisine':    { name: 'Peruvian cuisine' },
  'american-cuisine':    { name: 'American cuisine' },
  'canadian-cuisine':    { name: 'Canadian cuisine' },
  'moroccan-cuisine':    { name: 'Moroccan cuisine' },
  'nigerian-cuisine':    { name: 'Nigerian cuisine' },
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
      originGeoId: null,
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
