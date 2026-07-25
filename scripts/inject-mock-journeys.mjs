#!/usr/bin/env node
/**
 * Inject P1-1 journey payloads into apps/web/scripts/mock-api-data.json
 * under details[slug].journey — keeps top-level shape
 * { generatedFrom, list, map, details }.
 *
 * Source of truth for beat copy: packages/db/src/seed-data.ts JOURNEY_BEATS.
 * Re-run after editing JOURNEY_BEATS (or paste updates here).
 *
 * Usage: node scripts/inject-mock-journeys.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(
  __dirname,
  "..",
  "apps",
  "web",
  "scripts",
  "mock-api-data.json",
);

/** Mirrors JOURNEY_BEATS — ids are stable mock UUIDs for SSG. */
const JOURNEYS = {
  vindaloo: {
    beats: [
      {
        id: "j-vindaloo-1",
        sequence: 1,
        placeName: "Portugal",
        lat: 38.7223,
        lng: -9.1393,
        yearApprox: 1500,
        label:
          "Carne de vinha d'alhos — meat marinated in wine vinegar and garlic — travels with Portuguese sailors.",
        confidence: "documented",
        source: {
          id: "s-vindaloo-1",
          title: "Vindaloo",
          url: "https://en.wikipedia.org/wiki/Vindaloo",
          citationText:
            "Wikipedia. (2024). Vindaloo. https://en.wikipedia.org/wiki/Vindaloo",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-vindaloo-2",
        sequence: 2,
        placeName: "Goa",
        lat: 15.4909,
        lng: 73.8278,
        yearApprox: 1600,
        label:
          "In Portuguese Goa the marinade meets Kashmiri chilli and local spice; vinha d'alhos becomes vindaloo.",
        confidence: "documented",
        source: {
          id: "s-vindaloo-2",
          title: "Vindaloo",
          url: "https://en.wikipedia.org/wiki/Vindaloo",
          citationText:
            "Wikipedia. (2024). Vindaloo. https://en.wikipedia.org/wiki/Vindaloo",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-vindaloo-3",
        sequence: 3,
        placeName: "United Kingdom",
        lat: 51.5074,
        lng: -0.1278,
        yearApprox: 1970,
        label:
          "British curry-house vindaloo becomes a hotter, tomato-forward take — often far from the Goan original.",
        confidence: "likely",
        source: null,
      },
    ],
    lineages: [{ slug: "curry-spiced-stew", name: "Curry / Spiced Stew" }],
  },
  "banh-mi": {
    beats: [
      {
        id: "j-banhmi-1",
        sequence: 1,
        placeName: "France",
        lat: 48.8566,
        lng: 2.3522,
        yearApprox: 1850,
        label:
          "French baguette and pâté techniques enter Indochina with colonial administration and bakeries.",
        confidence: "documented",
        source: {
          id: "s-banhmi-1",
          title: "Bánh mì",
          url: "https://en.wikipedia.org/wiki/B%C3%A1nh_m%C3%AC",
          citationText:
            "Wikipedia. (2024). Bánh mì. https://en.wikipedia.org/wiki/Bánh_mì",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-banhmi-2",
        sequence: 2,
        placeName: "Vietnam",
        lat: 10.8231,
        lng: 106.6297,
        yearApprox: 1950,
        label:
          "Vietnamese bakers adapt the baguette with local fillings — coriander, pickled veg, chilli, cold cuts — as bánh mì.",
        confidence: "documented",
        source: {
          id: "s-banhmi-2",
          title: "Bánh mì",
          url: "https://en.wikipedia.org/wiki/B%C3%A1nh_m%C3%AC",
          citationText:
            "Wikipedia. (2024). Bánh mì. https://en.wikipedia.org/wiki/Bánh_mì",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-banhmi-3",
        sequence: 3,
        placeName: "Global diaspora",
        lat: 34.0522,
        lng: -118.2437,
        yearApprox: 1990,
        label:
          "Refugee and migrant communities carry bánh mì worldwide as a signature Vietnamese street sandwich.",
        confidence: "likely",
        source: null,
      },
    ],
    lineages: [{ slug: "flatbread", name: "Flatbread" }],
  },
  "chicken-tikka-masala": {
    beats: [
      {
        id: "j-ctm-1",
        sequence: 1,
        placeName: "South Asia",
        lat: 28.6139,
        lng: 77.209,
        yearApprox: 1900,
        label:
          "Chicken tikka — yoghurt-and-spice marinated pieces cooked in a tandoor — is established across North India and Pakistan.",
        confidence: "documented",
        source: {
          id: "s-ctm-1",
          title: "Chicken tikka masala",
          url: "https://en.wikipedia.org/wiki/Chicken_tikka_masala",
          citationText:
            "Wikipedia. (2024). Chicken tikka masala. https://en.wikipedia.org/wiki/Chicken_tikka_masala",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-ctm-2",
        sequence: 2,
        placeName: "Glasgow",
        lat: 55.8642,
        lng: -4.2518,
        yearApprox: 1970,
        label:
          "A creamy tomato-masala sauce is added to tikka in British-Indian restaurants; Glasgow is the best-known origin claim.",
        confidence: "likely",
        source: {
          id: "s-ctm-2",
          title: "Chicken tikka masala",
          url: "https://en.wikipedia.org/wiki/Chicken_tikka_masala",
          citationText:
            "Wikipedia. (2024). Chicken tikka masala. https://en.wikipedia.org/wiki/Chicken_tikka_masala",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-ctm-3",
        sequence: 3,
        placeName: "United Kingdom",
        lat: 51.5074,
        lng: -0.1278,
        yearApprox: 2001,
        label:
          "Widely called a British national dish — a diaspora hybrid that outgrew any single restaurant claim.",
        confidence: "likely",
        source: null,
      },
    ],
    lineages: [{ slug: "curry-spiced-stew", name: "Curry / Spiced Stew" }],
  },
  "ceviche-peruvian": {
    beats: [
      {
        id: "j-cev-1",
        sequence: 1,
        placeName: "Coastal Peru",
        lat: -12.0464,
        lng: -77.0428,
        yearApprox: -1000,
        label:
          "Pre-Columbian coastal peoples cure raw fish with acidic fruit juices and chilli — an ancestral ceviche form.",
        confidence: "likely",
        source: {
          id: "s-cev-1",
          title: "Ceviche",
          url: "https://en.wikipedia.org/wiki/Ceviche",
          citationText:
            "Wikipedia. (2024). Ceviche. https://en.wikipedia.org/wiki/Ceviche",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-cev-2",
        sequence: 2,
        placeName: "Spanish Americas",
        lat: -12.0464,
        lng: -77.0428,
        yearApprox: 1600,
        label:
          "Iberian citrus (lime/lemon) replaces or joins earlier acidifiers after Spanish introduction of citrus trees.",
        confidence: "documented",
        source: {
          id: "s-cev-2",
          title: "Ceviche",
          url: "https://en.wikipedia.org/wiki/Ceviche",
          citationText:
            "Wikipedia. (2024). Ceviche. https://en.wikipedia.org/wiki/Ceviche",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-cev-3",
        sequence: 3,
        placeName: "Lima",
        lat: -12.0464,
        lng: -77.0428,
        yearApprox: 1950,
        label:
          "Modern Peruvian ceviche — short cure, cancha, sweet potato, onion — becomes a national emblem and export.",
        confidence: "documented",
        source: null,
      },
    ],
    lineages: [],
  },
  "pizza-margherita": {
    beats: [
      {
        id: "j-piz-1",
        sequence: 1,
        placeName: "Naples",
        lat: 40.8518,
        lng: 14.2681,
        yearApprox: 1700,
        label:
          "Neapolitan flatbreads baked in wood ovens are everyday street food long before the Margherita name.",
        confidence: "documented",
        source: {
          id: "s-piz-1",
          title: "Pizza Margherita",
          url: "https://en.wikipedia.org/wiki/Pizza_Margherita",
          citationText:
            "Wikipedia. (2024). Pizza Margherita. https://en.wikipedia.org/wiki/Pizza_Margherita",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-piz-2",
        sequence: 2,
        placeName: "Americas → Naples",
        lat: 19.4326,
        lng: -99.1332,
        yearApprox: 1600,
        label:
          "New World tomato arrives in Europe and, after initial suspicion, becomes the red sauce of Neapolitan pizza.",
        confidence: "documented",
        source: null,
      },
      {
        id: "j-piz-3",
        sequence: 3,
        placeName: "Naples",
        lat: 40.8518,
        lng: 14.2681,
        yearApprox: 1889,
        label:
          "Tomato, mozzarella, and basil — colours of the Italian flag — are linked to Queen Margherita’s 1889 visit (a popular origin story).",
        confidence: "likely",
        source: {
          id: "s-piz-3",
          title: "Pizza Margherita",
          url: "https://en.wikipedia.org/wiki/Pizza_Margherita",
          citationText:
            "Wikipedia. (2024). Pizza Margherita. https://en.wikipedia.org/wiki/Pizza_Margherita",
          year: 2024,
          reliability: "secondary",
        },
      },
    ],
    lineages: [{ slug: "flatbread", name: "Flatbread" }],
  },
  poutine: {
    beats: [
      {
        id: "j-pou-1",
        sequence: 1,
        placeName: "Rural Quebec",
        lat: 45.5667,
        lng: -72.0,
        yearApprox: 1957,
        label:
          "Fries, fresh cheese curds, and gravy appear in Centre-du-Québec snack bars in the late 1950s — several towns claim firsts.",
        confidence: "likely",
        source: {
          id: "s-pou-1",
          title: "Poutine",
          url: "https://en.wikipedia.org/wiki/Poutine",
          citationText:
            "Wikipedia. (2024). Poutine. https://en.wikipedia.org/wiki/Poutine",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-pou-2",
        sequence: 2,
        placeName: "Montreal & urban Canada",
        lat: 45.5017,
        lng: -73.5673,
        yearApprox: 1980,
        label:
          "Poutine moves from rural casse-croûtes into city diners and late-night culture across Canada.",
        confidence: "documented",
        source: null,
      },
      {
        id: "j-pou-3",
        sequence: 3,
        placeName: "International",
        lat: 40.7128,
        lng: -74.006,
        yearApprox: 2000,
        label:
          "Gourmet and fast-casual versions spread abroad; curds and gravy remain the defining Quebec signature.",
        confidence: "likely",
        source: null,
      },
    ],
    lineages: [],
  },
  "jollof-rice": {
    beats: [
      {
        id: "j-jol-1",
        sequence: 1,
        placeName: "Senegambia (Wolof)",
        lat: 14.4974,
        lng: -14.4524,
        yearApprox: 1800,
        label:
          "Wolof thieboudienne / thieb — one-pot rice with tomato and fish or meat — is widely cited as an ancestor of jollof.",
        confidence: "likely",
        source: {
          id: "s-jol-1",
          title: "Jollof rice",
          url: "https://en.wikipedia.org/wiki/Jollof_rice",
          citationText:
            "Wikipedia. (2024). Jollof rice. https://en.wikipedia.org/wiki/Jollof_rice",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-jol-2",
        sequence: 2,
        placeName: "West Africa",
        lat: 6.5244,
        lng: 3.3792,
        yearApprox: 1950,
        label:
          "Regional jollof styles diverge across Ghana, Nigeria, Senegal, and neighbours — the friendly “jollof wars.”",
        confidence: "documented",
        source: {
          id: "s-jol-2",
          title: "Jollof rice",
          url: "https://en.wikipedia.org/wiki/Jollof_rice",
          citationText:
            "Wikipedia. (2024). Jollof rice. https://en.wikipedia.org/wiki/Jollof_rice",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-jol-3",
        sequence: 3,
        placeName: "Diaspora",
        lat: 51.5074,
        lng: -0.1278,
        yearApprox: 1990,
        label:
          "West African communities abroad make jollof a party and restaurant staple from London to New York.",
        confidence: "likely",
        source: null,
      },
    ],
    lineages: [{ slug: "rice-pilaf", name: "Rice as Carrier" }],
  },
  "tagine-moroccan": {
    beats: [
      {
        id: "j-tag-1",
        sequence: 1,
        placeName: "Berber North Africa",
        lat: 31.7917,
        lng: -7.0926,
        yearApprox: -500,
        label:
          "Earthenware conical-lid stewpots and slow braises are long associated with Amazigh (Berber) cooking.",
        confidence: "likely",
        source: {
          id: "s-tag-1",
          title: "Tajine",
          url: "https://en.wikipedia.org/wiki/Tajine",
          citationText:
            "Wikipedia. (2024). Tajine. https://en.wikipedia.org/wiki/Tajine",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-tag-2",
        sequence: 2,
        placeName: "Maghreb spice routes",
        lat: 34.0209,
        lng: -6.8416,
        yearApprox: 800,
        label:
          "Arab and trans-Saharan trade deepen spice, dried-fruit, and sweet–savoury profiles in Maghrebi tagines.",
        confidence: "likely",
        source: null,
      },
      {
        id: "j-tag-3",
        sequence: 3,
        placeName: "Morocco",
        lat: 31.6295,
        lng: -7.9811,
        yearApprox: 1900,
        label:
          "Moroccan tagine — lamb with prunes, chicken with preserved lemon — becomes the internationally known form.",
        confidence: "documented",
        source: null,
      },
    ],
    lineages: [{ slug: "curry-spiced-stew", name: "Curry / Spiced Stew" }],
  },
  sushi: {
    beats: [
      {
        id: "j-sus-1",
        sequence: 1,
        placeName: "Southeast Asia",
        lat: 15.87,
        lng: 100.9925,
        yearApprox: -300,
        label:
          "Narezushi-style fermented fish packed in rice begins as a preservation method along river cultures in SE Asia / southern China.",
        confidence: "likely",
        source: {
          id: "s-sus-1",
          title: "Sushi",
          url: "https://en.wikipedia.org/wiki/Sushi",
          citationText:
            "Wikipedia. (2024). Sushi. https://en.wikipedia.org/wiki/Sushi",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-sus-2",
        sequence: 2,
        placeName: "Edo (Tokyo)",
        lat: 35.6762,
        lng: 139.6503,
        yearApprox: 1820,
        label:
          "Edo-period nigiri — fresh fish on seasoned rice, eaten quickly — invents the form most of the world now calls sushi.",
        confidence: "documented",
        source: {
          id: "s-sus-2",
          title: "Sushi",
          url: "https://en.wikipedia.org/wiki/Sushi",
          citationText:
            "Wikipedia. (2024). Sushi. https://en.wikipedia.org/wiki/Sushi",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-sus-3",
        sequence: 3,
        placeName: "Global",
        lat: 34.0522,
        lng: -118.2437,
        yearApprox: 1980,
        label:
          "Post-war export and California rolls turn sushi into a worldwide restaurant category.",
        confidence: "documented",
        source: null,
      },
    ],
    lineages: [],
  },
  "pho-vietnamese": {
    beats: [
      {
        id: "j-pho-1",
        sequence: 1,
        placeName: "Northern Vietnam",
        lat: 21.0278,
        lng: 105.8342,
        yearApprox: 1910,
        label:
          "Phở emerges in the early 20th century around Hanoi — beef broth, rice noodles — with debated French and Chinese influences.",
        confidence: "likely",
        source: {
          id: "s-pho-1",
          title: "Pho",
          url: "https://en.wikipedia.org/wiki/Pho",
          citationText:
            "Wikipedia. (2024). Pho. https://en.wikipedia.org/wiki/Pho",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-pho-2",
        sequence: 2,
        placeName: "Southern Vietnam",
        lat: 10.8231,
        lng: 106.6297,
        yearApprox: 1954,
        label:
          "After partition, southern phở grows sweeter and more herb-heavy; street stalls proliferate in Saigon.",
        confidence: "documented",
        source: {
          id: "s-pho-2",
          title: "Pho",
          url: "https://en.wikipedia.org/wiki/Pho",
          citationText:
            "Wikipedia. (2024). Pho. https://en.wikipedia.org/wiki/Pho",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-pho-3",
        sequence: 3,
        placeName: "Diaspora",
        lat: 33.6846,
        lng: -117.8265,
        yearApprox: 1975,
        label:
          "Refugee communities after 1975 plant phở restaurants across the US, France, and Australia.",
        confidence: "documented",
        source: null,
      },
    ],
    lineages: [{ slug: "noodle-soup", name: "Noodle Soup" }],
  },
  falafel: {
    beats: [
      {
        id: "j-fal-1",
        sequence: 1,
        placeName: "Egypt / Levant",
        lat: 30.0444,
        lng: 31.2357,
        yearApprox: 1800,
        label:
          "Deep-fried chickpea or fava fritters — origin is contested between Egypt (taʿamiya) and the wider Levant.",
        confidence: "possible",
        source: {
          id: "s-fal-1",
          title: "Falafel",
          url: "https://en.wikipedia.org/wiki/Falafel",
          citationText:
            "Wikipedia. (2024). Falafel. https://en.wikipedia.org/wiki/Falafel",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-fal-2",
        sequence: 2,
        placeName: "Levantine cities",
        lat: 33.8938,
        lng: 35.5018,
        yearApprox: 1950,
        label:
          "Street falafel in pita with tahini and salad becomes everyday Levantine fast food.",
        confidence: "documented",
        source: null,
      },
      {
        id: "j-fal-3",
        sequence: 3,
        placeName: "Global",
        lat: 40.7128,
        lng: -74.006,
        yearApprox: 1980,
        label:
          "Vegetarian and street-food waves carry falafel worldwide; regional rivalries over “authentic” origin continue.",
        confidence: "parallel",
        source: null,
      },
    ],
    lineages: [],
  },
  "hamburger-american": {
    beats: [
      {
        id: "j-ham-1",
        sequence: 1,
        placeName: "Hamburg",
        lat: 53.5511,
        lng: 9.9937,
        yearApprox: 1800,
        label:
          "Hamburg steak — seasoned minced beef — is known in German and Atlantic port cooking before the sandwich.",
        confidence: "likely",
        source: {
          id: "s-ham-1",
          title: "Hamburger",
          url: "https://en.wikipedia.org/wiki/Hamburger",
          citationText:
            "Wikipedia. (2024). Hamburger. https://en.wikipedia.org/wiki/Hamburger",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-ham-2",
        sequence: 2,
        placeName: "United States",
        lat: 40.7128,
        lng: -74.006,
        yearApprox: 1900,
        label:
          "German-American immigration and US fairs put the patty in a bun — multiple US towns claim the first hamburger.",
        confidence: "likely",
        source: {
          id: "s-ham-2",
          title: "Hamburger",
          url: "https://en.wikipedia.org/wiki/Hamburger",
          citationText:
            "Wikipedia. (2024). Hamburger. https://en.wikipedia.org/wiki/Hamburger",
          year: 2024,
          reliability: "secondary",
        },
      },
      {
        id: "j-ham-3",
        sequence: 3,
        placeName: "Global fast food",
        lat: 41.8781,
        lng: -87.6298,
        yearApprox: 1955,
        label:
          "Mid-century chains industrialise the hamburger into a worldwide fast-food template.",
        confidence: "documented",
        source: null,
      },
    ],
    lineages: [],
  },
};

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
if (!data.generatedFrom || !data.list || !data.map || !data.details) {
  console.error(
    "ABORT: mock-api-data.json missing { generatedFrom, list, map, details }",
  );
  process.exit(1);
}

let injected = 0;
let missing = 0;
for (const [slug, journey] of Object.entries(JOURNEYS)) {
  if (!data.details[slug]) {
    console.warn(`! detail missing for ${slug} — skip`);
    missing++;
    continue;
  }
  data.details[slug].journey = {
    slug,
    beats: journey.beats,
    lineages: journey.lineages,
  };
  injected++;
}

data.generatedFrom = `${String(data.generatedFrom).replace(/; journeys.*$/, "")}; journeys injected ${new Date().toISOString().slice(0, 10)}`;

writeFileSync(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Injected journey into ${injected} details; ${missing} missing.`);
