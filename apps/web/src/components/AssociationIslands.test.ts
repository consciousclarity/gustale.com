import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { AtlasResponse, PlaceResponse } from "../lib/api";

test("association islands render their initial data without an API request", async (t) => {
  // Load TSX and import.meta.env the same way Astro does during the build.
  const astroRequire = createRequire(import.meta.resolve("astro"));
  const { createServer } = await import(
    pathToFileURL(astroRequire.resolve("vite")).href
  );
  const vite = await createServer({
    configFile: false,
    oxc: { jsx: { runtime: "automatic" } },
    server: { middlewareMode: true, ws: false },
  });
  t.after(() => vite.close());

  const snapshot = JSON.parse(
    await readFile(
      new URL("../../scripts/mock-api-data.json", import.meta.url),
      "utf8",
    ),
  );
  const atlas: AtlasResponse = snapshot.atlas["moussaka-greek"];
  const greece = atlas.placesAndTraditions.find((row) => row.name === "Greece");
  assert.ok(greece);
  const placeMetadata: PlaceResponse["place"] | undefined =
    snapshot.places.places.find(
      (row: PlaceResponse["place"]) => row.slug === "greece",
    );
  assert.ok(placeMetadata);
  const place: PlaceResponse = {
    place: placeMetadata,
    groups: [
      {
        relationship: greece.relationship,
        label: "Unverified associations",
        dishes: [
          {
            slug: atlas.dish.slug,
            canonicalName: atlas.dish.canonicalName,
            shortDescription: null,
            viewCount: 0,
            evidence: greece.evidence,
            explanation: null,
          },
        ],
      },
    ],
    counts: { dishes: 1, groups: 1 },
  };

  const [{ default: PlaceDishes }, { default: AtlasPlaces }] =
    await Promise.all([
      vite.ssrLoadModule("/src/components/PlaceDishes.tsx"),
      vite.ssrLoadModule("/src/components/AtlasPlaces.tsx"),
    ]);
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Initial data should satisfy the render");
  });

  const dishes = renderToString(
    createElement(PlaceDishes, {
      slug: "greece",
      initialData: place,
    }),
  );
  assert.match(dishes, /href="\/dishes\/moussaka-greek"[^>]*>Moussaka<\/a>/);
  assert.match(dishes, />Unverified<\/span>/);
  assert.doesNotMatch(dishes, /Loading the dishes/);

  const associations = renderToString(
    createElement(AtlasPlaces, {
      slug: atlas.dish.slug,
      dishName: atlas.dish.canonicalName,
      initialData: atlas,
    }),
  );
  assert.match(associations, />Greece<\//);
  assert.match(associations, />Unverified<\/span>/);
  assert.doesNotMatch(associations, /Loading the associations/);
  assert.match(
    renderToString(
      createElement(PlaceDishes, { slug: "greece", initialData: null }),
    ),
    /Loading the dishes/,
  );
  assert.match(
    renderToString(
      createElement(AtlasPlaces, {
        slug: atlas.dish.slug,
        dishName: atlas.dish.canonicalName,
      }),
    ),
    /Loading the associations/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
