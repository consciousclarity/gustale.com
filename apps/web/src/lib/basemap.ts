/**
 * Shared basemap configuration for every MapLibre map on the site
 * (<WorldMap>, <DishMap>, <DishJourney> and the homepage <GustaleHomeIsland>).
 *
 * Why this module exists
 * ----------------------
 * CARTO retired its free, keyless *raster* basemaps on 25 September 2026.
 * Requests to `basemaps.cartocdn.com/rastertiles/...` without an API key
 * now return a 2049-byte PNG that is nothing but the repeated text
 * "API KEY REQUIRED / carto.com/basemaps/apikey" — HTTP 200, correct
 * content type, but no map. Every tile is byte-identical, so the map
 * renders as a tiled watermark instead of cartography. This went
 * unnoticed for a month because the requests never failed.
 *
 * CARTO's *vector* GL styles still load without a key (their own docs:
 * "Only the raster basemaps require a key today. Vector styles still
 * load without one."), and vector tiles are the format CARTO recommends
 * for new applications anyway. So we use the vector style and get:
 *   - real cartography again,
 *   - sharper rendering on HiDPI displays,
 *   - a basemap that can actually be projected onto the 3D globe that
 *     <WorldMap> and the homepage island use (raster tiles drape badly
 *     on a globe).
 *
 * The style URL lives here so the provider can be swapped in one place
 * instead of four.
 *
 * Optional API key
 * ----------------
 * CARTO may extend the key requirement to vector styles in future. If
 * PUBLIC_CARTO_API_KEY is set at build time, `basemapTransformRequest`
 * appends `?key=` to every basemaps.cartocdn.com request (style, tiles,
 * glyphs and sprite), exactly as CARTO documents. When it is unset the
 * maps keep working keyless, so a build never depends on the key
 * existing. The key is a public, browser-side token by design (like a
 * Mapbox public token) and is never a server-side secret.
 */

/**
 * CARTO vector GL style URL. `voyager` matches the cartography the
 * raster basemap used to provide, so the site keeps its look.
 */
export const CARTO_VECTOR_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

/**
 * Optional CARTO basemap key, read from the build-time environment.
 * Empty string means "no key" — the keyless vector style still works.
 */
const CARTO_API_KEY: string =
  (import.meta.env.PUBLIC_CARTO_API_KEY as string | undefined)?.trim() ?? "";

/**
 * True when the URL points at a CARTO basemap asset that needs the key.
 * Covers both the style/tile hosts (`basemaps.cartocdn.com`) and the
 * asset host the style references (`tiles.basemaps.cartocdn.com`).
 */
function isCartoBasemapUrl(url: string): boolean {
  return /(^|\.)basemaps\.cartocdn\.com\//.test(url);
}

/**
 * MapLibre `transformRequest` hook. Appends `?key=` to CARTO basemap
 * requests when a key is configured, leaving every other request
 * untouched.
 *
 * MapLibre derives both `<sprite>.json` and `<sprite>.png` from the same
 * base URL and requests them separately, so a key can legitimately show
 * up more than once across a page's requests. We still guard against
 * adding it twice to the same URL.
 */
export function basemapTransformRequest(url: string): { url: string } {
  if (!CARTO_API_KEY || !isCartoBasemapUrl(url)) return { url };
  if (url.includes("key=")) return { url };
  return { url: `${url}${url.includes("?") ? "&" : "?"}key=${CARTO_API_KEY}` };
}

/**
 * True when a CARTO basemap key is configured for this build.
 */
export function hasCartoApiKey(): boolean {
  return CARTO_API_KEY.length > 0;
}
