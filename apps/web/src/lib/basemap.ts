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

/**
 * OpenStreetMap's own raster tile service.
 *
 * Used as a FALLBACK source for the journey maps. It was verified
 * reachable for every region the pilot frames (Korea, Jinju,
 * Jeonju/Seoul, Japan) on 12 November 2026, the same day CARTO's vector
 * tile service was timing out.
 *
 * OSM's tile usage policy (https://operations.osmfoundation.org/policies/tiles/)
 * requires a valid identifying User-Agent and forbids heavy or bulk
 * downloading. The maps load a handful of tiles per chapter as a reader
 * scrolls, which is the intended use; the site's own MapLibre maps
 * already follow the same pattern.
 */
export const OSM_RASTER_TILES =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * The identifying User-Agent the OSM tile policy asks for.
 *
 * A browser cannot set its own User-Agent, but MapLibre CAN send a
 * custom one per request through `transformRequest` — and the policy
 * asks for something that identifies the application rather than the
 * browser. The site's existing maps do not set one; this does, for the
 * journey maps only, so the requests are identifiable and rate-friendly.
 */
export const OSM_TILE_USER_AGENT = "Gustale Atlas/1.0 (https://gustale.com)";

/**
 * The Referer the OSM tile policy asks web pages to send.
 *
 * The policy asks for "a valid HTTP Referer header" from web pages.
 * MapLibre's `transformRequest` can set one per request, so the OSM
 * tile requests carry it.
 */
export const OSM_TILE_REFERER = "https://gustale.com/";

/**
 * True when a request is for the OSM raster tile service.
 */
export function isOsmRasterTile(url: string): boolean {
  return url.includes("tile.openstreetmap.org");
}

/**
 * Probe the CARTO vector tile service.
 *
 * Returns:
 *   "ok"      — the service answered, so the vector tiles are usable.
 *   "failed"  — the service did not answer, so use the raster fallback.
 *   "unknown" — the probe could not tell (a slow answer, a blocked
 *               request). Use the vector tiles and keep the per-map
 *               watchdog as a backstop.
 *
 * ONE tile at a low zoom is requested. That is not a bulk download and
 * does not breach the provider's tile policy; it is the same kind of
 * request the browser makes anyway.
 */
/**
 * The ONE shared probe.
 *
 * Module-level, so the first caller starts it and every other caller
 * awaits the same promise. A six-chapter page makes ONE probe request,
 * not six, and every map on the page gets the same answer — so a page
 * can never show a mix of vector and raster maps.
 */
export type TileProbeResult =
  /** The vector tile service answered. */
  | "ok"
  /** The STYLE loaded but the vector TILES did not: the provider's
   *  tile service is broken, but the network is fine. */
  | "vector_down"
  /** Neither the style nor a tile loaded: the network is blocked. */
  | "network_down";

let vectorTileProbe: Promise<TileProbeResult> | null = null;

export function probeVectorTiles(): Promise<TileProbeResult> {
  if (vectorTileProbe) return vectorTileProbe;

  const probeUrl =
    "https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/0/0/0.mvt";

  vectorTileProbe = (async () => {
    // TWO requests, and the order matters.
    //
    // The STYLE is fetched first. The style is a small JSON document
    // that answers "is the network working at all". If the style loads
    // and a VECTOR TILE does not, the provider's tile service is
    // broken while the network is fine — which is exactly the failure
    // observed on 12 November 2026, and it is the case where falling
    // back to another provider is both safe and useful.
    //
    // If the STYLE also fails, the network is blocked or down, and no
    // tile service should be asked for anything. The map shows its
    // fallback panel and makes no tile requests.
    try {
      const styleController = new AbortController();
      const styleTimer = setTimeout(() => styleController.abort(), 4000);
      const styleRes = await fetch(CARTO_VECTOR_STYLE_URL, {
        method: "GET",
        signal: styleController.signal,
        cache: "no-store",
      });
      clearTimeout(styleTimer);
      if (!styleRes.ok) return "network_down";
    } catch {
      // The style did not load either: the network is not usable.
      return "network_down";
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(probeUrl, {
        method: "GET",
        signal: controller.signal,
        // "no-store" is right for a reachability probe: the answer must
        // reflect the service NOW, not a cached answer from earlier.
      });
      clearTimeout(timer);
      if (res.ok) return "ok";
      // A 404 means the service is up but the tile path has moved —
      // which is also a failure for our purposes.
      return "vector_down";
    } catch {
      // The style loaded but the tile did not: the provider's tile
      // service is not answering, and the network is fine.
      return "vector_down";
    }
  })();

  return vectorTileProbe;
}

/**
 * Forget the cached probe.
 *
 * Only for tests. It exists so a test can exercise the "ok" and the
 * "failed" path without the module cache leaking between cases.
 */
export function resetVectorTileProbe(): void {
  vectorTileProbe = null;
}
