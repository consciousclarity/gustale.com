/**
 * The dish page's PUBLIC contract.
 *
 * Three things are asserted here, and each of them is a leak that
 * happened:
 *
 *   1. The association's INTERNAL EXPLANATION must never be rendered.
 *      It held the database's migration notes and was printed to the
 *      reader verbatim.
 *
 *   2. The cover must be a 4:3 photograph BESIDE the title, shown
 *      immediately, with a responsive srcset that asks for the 800w
 *      file on a phone. It used to be a full-bleed hero behind a dark
 *      frame that stayed on screen for 1.25s at 1440px and 2.5s at
 *      390px.
 *
 *   3. The accent theme follows the PAGE: herb green on the recipe
 *      pages, terracotta everywhere else.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = apps/web/src/lib
//   ..      = apps/web/src
//   ../..   = apps/web
//   ../../.. = apps
//   ../../../.. = the repo root
const ROOT = join(HERE, "..", "..", "..", "..");
const COMPONENTS = join(ROOT, "apps", "web", "src", "components");
const LIB = join(ROOT, "apps", "web", "src", "lib");
const API_ROUTES = join(ROOT, "apps", "api", "src", "routes");
const PAGES = join(ROOT, "apps", "web", "src", "pages");
const STYLES = join(ROOT, "apps", "web", "src", "styles");

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

/** The source with every comment removed, so a rule about CODE is not
 *  satisfied by a comment that merely MENTIONS the thing. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("the association's internal explanation is never public", () => {
  it("the API does not select it", () => {
    const source = code(join(API_ROUTES, "atlas.ts"));
    for (const field of ["explanation", "legacy_value", "provenance"]) {
      assert.ok(
        !new RegExp(`\\b${field}\\b`).test(source),
        `atlas.ts still reads the association's ${field}`,
      );
    }
  });

  it("the client type does not carry it", () => {
    const source = code(join(LIB, "api.ts"));
    for (const field of ["explanation", "legacyValue", "provenance"]) {
      assert.ok(
        !new RegExp(`\\b${field}\\b`).test(source),
        `the client type still declares ${field}`,
      );
    }
  });

  it("the renderer does not print it", () => {
    const source = code(join(COMPONENTS, "AtlasPlaces.tsx"));
    assert.ok(
      !/\bexplanation\b/.test(source),
      "AtlasPlaces.tsx still renders the association's explanation",
    );
  });

  it("the public sentence is the only prose it renders", () => {
    const source = code(join(COMPONENTS, "AtlasPlaces.tsx"));
    assert.ok(
      source.includes("atlas-association__sentence"),
      "the association has no public sentence",
    );
  });
});

describe("the cover", () => {
  it("is a 4:3 frame, not a full-bleed hero", () => {
    const source = code(join(COMPONENTS, "DishCover.tsx"));
    assert.ok(source.includes("dish-cover__frame"), "the cover has no frame");
    const css = code(join(STYLES, "global.css"));
    assert.ok(
      /aspect-ratio:\s*4\s*\/\s*3/.test(css),
      "the cover frame is not 4:3",
    );
  });

  it("has no dark frame to wait for", () => {
    const source = code(join(COMPONENTS, "DishCover.tsx"));
    assert.ok(
      !/fallback/i.test(source),
      "the cover still has a fallback, which is the dark frame",
    );
    assert.ok(
      !/is-ready/i.test(source),
      "the cover still gates the image behind a class, which delays it",
    );
  });

  it("loads eagerly and asks for the responsive set", () => {
    const source = code(join(COMPONENTS, "DishCover.tsx"));
    assert.ok(
      /loading="eager"/.test(source),
      "the cover image is not eager — it is the top of the page",
    );
    assert.ok(
      /fetchPriority="high"/.test(source),
      "the cover image is not high priority",
    );
    assert.ok(/srcSet/.test(source), "the cover image has no srcset");
    assert.ok(
      /sizes=/.test(source),
      "the cover image has no sizes, so the browser cannot choose the 800w file",
    );
  });

  it("offers the 800w file AND the 1536w file", () => {
    // The srcset is built from the media variants, so the widths are
    // asserted on the BUILDER and on the live media, not as literals
    // in the component.
    const builder = code(join(COMPONENTS, "DishCover.tsx"));
    assert.ok(
      /`\$\{url\}\s+\$\{width\}w`/.test(builder),
      "the srcset builder does not emit width descriptors",
    );
    // The moussaka cover is the one with both files. The media
    // variants live on the dish's media attachments, which is what the
    // srcset is built from.
    const fixture = read(
      join(ROOT, "apps", "web", "scripts", "mock-api-data.json"),
    );
    assert.ok(
      fixture.includes("cover-800w.webp"),
      "the moussaka cover has no 800w variant",
    );
    assert.ok(
      fixture.includes("cover-1536w.webp"),
      "the moussaka cover has no 1536w variant",
    );
  });

  it("is the 800w file that a phone asks for", () => {
    // The sizes descriptor must describe the box the cover actually
    // occupies: a fraction of the viewport on a narrow screen, NOT
    // "100vw" of a full-bleed hero.
    const source = code(join(COMPONENTS, "DishCover.tsx"));
    const m = source.match(/const COVER_SIZES\s*=\s*"([^"]+)"/);
    assert.ok(m, "the cover has no sizes descriptor");
    const sizes = m[1];
    assert.ok(
      /vw/.test(sizes),
      "the sizes descriptor does not describe a viewport fraction",
    );
    // A phone gets a NARROW box. "100vw" on a full-bleed hero made the
    // browser pick the 1536w file on a 390px screen.
    assert.ok(
      !/100vw/.test(sizes),
      `the sizes descriptor says 100vw, so a phone downloads the desktop file: ${sizes}`,
    );
    // And the phone case must be present at all.
    assert.ok(
      /92vw/.test(sizes),
      "the sizes descriptor has no narrow-screen case, so a phone falls back to the src attribute",
    );
  });
});

describe("the accent theme follows the page", () => {
  it("the layout takes a theme", () => {
    const source = code(
      join(PAGES, "dishes", "..", "..", "layouts", "Layout.astro"),
    );
    assert.ok(
      /theme\??:\s*"atlas"\s*\|\s*"recipes"/.test(source),
      "the layout does not take a theme prop",
    );
    assert.ok(
      /data-domain=\{theme\}/.test(source),
      "the body's data-domain does not follow the theme",
    );
  });

  it("the recipe pages ask for the herb green", () => {
    for (const page of ["index.astro", join("[slug].astro")]) {
      const source = code(join(PAGES, "recipes", page));
      assert.ok(
        source.includes('theme="recipes"'),
        `${page} does not ask for the recipes theme`,
      );
    }
  });

  it("the dish page does NOT ask for the herb green", () => {
    const source = code(join(PAGES, "dishes", "[slug].astro"));
    assert.ok(
      !source.includes('theme="recipes"'),
      "the dish page asks for the herb green — the header button must be terracotta there",
    );
  });
});

describe("prepared components are components, not the method", () => {
  it("the component list is built from the ingredient category", () => {
    const source = code(join(LIB, "preparedComponents.ts"));
    assert.ok(
      source.includes("savoury-sauces"),
      "the prepared-component categories do not include the sauces",
    );
  });

  it("the categories are real taxonomy slugs", () => {
    // Only the list INSIDE the constant is checked -- a slug quoted in
    // a comment is not a category.
    const source = code(join(LIB, "preparedComponents.ts"));
    const start = source.indexOf("PREPARED_COMPONENT_CATEGORIES");
    assert.ok(start > 0, "the prepared-component categories are gone");
    const list = source.slice(start, source.indexOf("] as const", start));
    const schema = read(
      join(ROOT, "packages", "db", "src", "schema", "index.ts"),
    );

    const listed = [...list.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.ok(
      listed.length >= 5,
      "the prepared-component list is suspiciously short",
    );
    for (const slug of listed) {
      assert.ok(
        schema.includes(`"${slug}"`),
        `the prepared-component category "${slug}" is not a taxonomy slug`,
      );
    }
  });

  it("the section is fed the ingredients, not the preparations", () => {
    const source = code(join(COMPONENTS, "DishContentSections.tsx"));
    assert.ok(
      source.includes("preparedComponents(ingredients)"),
      "the Prepared components list is not built from the ingredients",
    );
    assert.ok(
      !/preparations\.map/.test(source),
      "the Prepared components list is still fed the preparation rows",
    );
  });

  it("the method goes to the Technique row", () => {
    const source = code(join(LIB, "dishFacts.ts"));
    assert.ok(
      source.includes("methodName"),
      "the facts builder does not use the preparation method's name",
    );
  });
});
