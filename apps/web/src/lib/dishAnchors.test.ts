/**
 * THE ANCHOR CONTRACT
 *
 * A dish page is a document with an in-page navigation. The navigation's
 * links are `#id` fragments, and every one of them has to land on
 * something.
 *
 * That contract is easy to break in ways a type-checker cannot see:
 *
 *   - a section renders its heading with `id="connections-heading"` AND
 *     its wrapper `<section>` carries the same `id` — two elements with
 *     one id, and a fragment link that resolves to the first of them;
 *   - the nav offers a link to a section the page does not render;
 *   - the nav omits a link to a section the page DOES render.
 *
 * All three happened while this page was being built, so they are
 * tested here rather than discovered in a browser.
 *
 * WHY THESE ARE READ FROM THE SOURCE FILES
 *
 * The components are `.tsx`, and this suite runs under Node's
 * type-stripping runner, which cannot import JSX. So the test reads the
 * source and checks the parts that matter — the ids, the order, the
 * headings — with regular expressions. It is a lint with teeth, not a
 * render: it proves the ANCHORS agree with each other and with the
 * registry, which is the part that silently broke.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildSectionLinks,
  DISH_SECTION_IDS,
  DISH_SECTION_ORDER,
} from "./dishSections.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENTS = join(HERE, "..", "components");
const PAGES = join(HERE, "..", "pages", "dishes");

function read(...parts: string[]): string {
  return readFileSync(join(...parts), "utf-8");
}

// ── The registry ──────────────────────────────────────────────────────────

test("the section ids are unique", () => {
  const ids = DISH_SECTION_ORDER.map((entry) => entry.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "two sections share an id, so one nav link would resolve to the wrong section",
  );
});

test("the section order is the mockup's", () => {
  assert.deepEqual(
    DISH_SECTION_ORDER.map((entry) => entry.label),
    [
      "Overview",
      "Where",
      "History",
      "Connections",
      "Variants",
      "Ingredients",
      "Recipes",
      "Sources",
    ],
  );
});

// ── The sections' headings ────────────────────────────────────────────────
//
// Each section's HEADING carries the section's id. The wrapper <section>
// points at it with aria-labelledby. If the wrapper also carried the id,
// the document would have the same id twice.

const SECTION_COMPONENTS = [
  {
    file: "DishContentSections.tsx",
    ids: ["connections", "variants", "ingredients", "recipes", "sources"],
  },
];

/**
 * The overview is the one section whose anchor is NOT on a heading.
 *
 * The nav's "Overview" link must land on the overview BLOCK -- the
 * article that holds the cover, the breadcrumb, the title and the facts
 * table. Putting the id on the <h1> inside it would make the link land
 * on the title and skip the facts table, which is the section's whole
 * point.
 *
 * So the article owns DISH_SECTION_IDS.overview, and the <h1> inside it
 * owns DISH_SECTION_IDS.overviewTitle -- the id the article's
 * aria-labelledby points at. Two ids, two elements, no collision.
 */
test("the overview's anchor is on the block, and its heading has its own id", () => {
  const source = read(COMPONENTS, "DishDetail.tsx");

  const article = source.match(/<article[\s\S]{0,300}?>/);
  assert.ok(article, "DishDetail has no <article> to hold the overview");
  assert.match(
    article[0],
    /id=\{DISH_SECTION_IDS\.overview\}/,
    "the overview's <article> does not carry the nav anchor -- the nav's first link would not resolve",
  );
  assert.match(
    article[0],
    /aria-labelledby=\{DISH_SECTION_IDS\.overviewTitle\}/,
    "the overview's <article> does not point at the heading it is labelled by",
  );

  assert.match(
    source,
    /<h1[^>]*id=\{DISH_SECTION_IDS\.overviewTitle\}/,
    "the overview's <h1> does not carry the title id the article points at",
  );

  // And the two ids are different, so the document has no duplicate.
  assert.notEqual(
    DISH_SECTION_IDS.overview,
    DISH_SECTION_IDS.overviewTitle,
    "the overview's block and its heading share an id, so one of them is unreachable",
  );
});

/**
 * The element that owns a section's id must be a HEADING.
 *
 * A fragment link lands on whatever carries the id. If a wrapper carries
 * it, the reader lands on the edge of the section with the heading below
 * the fold; if the heading carries it, they land on the heading itself.
 */
function headingOwnsId(source: string, key: string): boolean {
  const pattern = new RegExp(
    `<(h1|h2|h3)[^>]*id=\\{DISH_SECTION_IDS\\.${key}\\}`,
  );
  return pattern.test(source);
}

test("no section heading and its wrapper claim the same id", () => {
  for (const { file, ids } of SECTION_COMPONENTS) {
    const source = read(COMPONENTS, file);

    for (const key of ids) {
      // The heading owns the id.
      assert.ok(
        headingOwnsId(source, key),
        `${file}: the "${key}" section has no id on its heading — the nav's link to it would not resolve`,
      );

      // And it is used ONCE for the id, not twice.
      const idUsages = source.split(`id={DISH_SECTION_IDS.${key}}`).length - 1;
      assert.equal(
        idUsages,
        1,
        `${file}: DISH_SECTION_IDS.${key} is used ${idUsages} times as an element id — ` +
          `a document may only carry an id once, or a fragment link resolves to the wrong element`,
      );

      // The wrapper names it through aria-labelledby instead.
      assert.ok(
        source.includes(`aria-labelledby={DISH_SECTION_IDS.${key}}`),
        `${file}: the "${key}" section wrapper does not point at its heading`,
      );
    }
  }
});

test("the heading and the wrapper do not both carry the id", () => {
  // The precise shape of the bug: a <section id=...> whose <h2> has the
  // same id. The h2's id is the one that survives, and the wrapper's is a
  // duplicate that no link points at — which is harmless until a
  // validator complains.
  for (const { file, ids } of SECTION_COMPONENTS) {
    const source = read(COMPONENTS, file);
    for (const key of ids) {
      const pattern = new RegExp(
        `<section[^>]*id=\\{DISH_SECTION_IDS\\.${key}\\}[^>]*>`,
        "s",
      );
      assert.equal(
        pattern.test(source),
        false,
        `${file}: the "${key}" <section> carries the id as well as its heading — duplicate id`,
      );
    }
  }
});

// ── The nav ───────────────────────────────────────────────────────────────

test("the nav offers every section the page renders", () => {
  // The page always renders History — with an explicit empty state when
  // there is no dated record — so the nav always offers it.
  const links = buildSectionLinks({
    hasWhere: true,
    hasHistory: true,
    hasConnections: true,
    hasVariants: true,
    hasIngredients: true,
    hasRecipes: true,
    hasSources: true,
  });

  assert.deepEqual(
    links.map((link) => link.label),
    [
      "Overview",
      "Where",
      "History",
      "Connections",
      "Variants",
      "Ingredients",
      "Recipes",
      "Sources",
    ],
    "the nav's links do not cover the page's sections",
  );
});

test("a section the page does not render gets no nav link", () => {
  const links = buildSectionLinks({
    hasWhere: true,
    hasHistory: true,
    hasConnections: false,
    hasVariants: false,
    hasIngredients: true,
    hasRecipes: false,
    hasSources: true,
  });

  const labels = links.map((link) => link.label);
  assert.ok(!labels.includes("Connections"), "a link to a missing section");
  assert.ok(!labels.includes("Variants"), "a link to a missing section");
  assert.ok(!labels.includes("Recipes"), "a link to a missing section");
  assert.ok(labels.includes("Ingredients"), "a rendered section lost its link");
});

test("every nav link points at a registered id", () => {
  const known = new Set(Object.values(DISH_SECTION_IDS));
  const links = buildSectionLinks({
    hasWhere: true,
    hasHistory: true,
    hasConnections: true,
    hasVariants: true,
    hasIngredients: true,
    hasRecipes: true,
    hasSources: true,
  });

  for (const link of links) {
    assert.ok(
      known.has(link.id),
      `the nav links to #${link.id}, which is not a registered section id`,
    );
  }
});

// ── The page ──────────────────────────────────────────────────────────────

test("the page passes a flag for every section the nav can link to", () => {
  const source = read(PAGES, "[slug].astro");

  for (const flag of [
    "hasWhere",
    "hasHistory",
    "hasConnections",
    "hasVariants",
    "hasIngredients",
    "hasRecipes",
    "hasSources",
  ]) {
    assert.ok(
      source.includes(`${flag}=`),
      `the page does not tell the nav whether it renders ${flag} — the nav would guess`,
    );
  }
});

test("the overview island does not receive the data of sections it does not render", () => {
  const source = read(PAGES, "[slug].astro");

  // The overview island renders the cover, the title, the facts table and
  // the nav. The sections BELOW the map are rendered by
  // `DishContentSections`. Passing their data to the overview would pull
  // it into the island's JavaScript bundle for nothing.
  const island = source.slice(
    source.indexOf("<DishDetail"),
    source.indexOf("client:load", source.indexOf("<DishDetail")),
  );

  for (const prop of [
    "variants=",
    "ingredients=",
    "preparations=",
    "sources=",
    "journeyBeats=",
  ]) {
    assert.ok(
      !island.includes(prop),
      `the overview island receives ${prop} but does not render that section`,
    );
  }
});
