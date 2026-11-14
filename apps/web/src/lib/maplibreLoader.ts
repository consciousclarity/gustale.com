/**
 * Typed access to the dynamically-imported MapLibre bundle.
 *
 * `maplibre-gl` is imported dynamically so the WebGL helpers are not
 * evaluated at module-eval time. Its module namespace has no `default`
 * in the type definitions even though the runtime bundle exposes one,
 * so the namespace is cast once, here, rather than at every call site.
 *
 * This is the ONE place the cast lives. Every map component imports
 * `loadMapLibre` and gets a properly typed namespace.
 */

import type * as MapLibre from "maplibre-gl";

export type MapLibreModule = typeof MapLibre;

export async function loadMapLibre(): Promise<MapLibreModule> {
  const mod = await import("maplibre-gl");
  const runtime = (mod as unknown as { default?: MapLibreModule }).default;
  return runtime ?? (mod as unknown as MapLibreModule);
}
