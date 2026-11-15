/**
 * The pilot presentation, isolated behind one module.
 *
 * WHY THIS EXISTS
 *
 * The new dish-journey presentation must not ship in a build where the
 * pilot is off. Not merely "must not render" — must not be BUILT or
 * DOWNLOADED:
 *
 *   * `DishDetail` is a `client:load` island, so its whole module graph
 *     lands in a chunk every dish page loads. Importing the pilot
 *     components from it put the pilot's JavaScript in a chunk the
 *     public site loads, even with the pilot off.
 *   * A CSS `import` in any module makes the bundler hoist the
 *     stylesheet into the page's CSS bundle, so every dish page
 *     downloaded the pilot's stylesheet too.
 *
 * So the pilot lives HERE, and `DishDetail` reaches it through a DYNAMIC
 * import. Vite splits a dynamic import into its own chunk, which is only
 * fetched if the import actually runs. With the pilot off, the condition
 * is false, the dynamic import never executes, and the chunk is never
 * downloaded.
 *
 * The stylesheet is injected at RUNTIME for the same reason: a CSS import
 * cannot be split out of the page bundle by a bundler.
 *
 * The gate is `pilotEnabled()` (lib/dishJourneyPilot), which is false
 * unless PUBLIC_DISH_JOURNEY_PILOT=1 and the build is the Atlas.
 */

import type { DishSectionLink } from "../lib/dishSections";
import {
  DishIngredientOverview,
  type DishIngredientOverviewProps,
} from "./DishIngredientOverview";
import { DishSectionNav } from "./DishSectionNav";

export type { DishIngredientOverviewProps, DishSectionLink };

export { DishIngredientOverview, DishSectionNav };

/**
 * The pilot's stylesheet is loaded from a STABLE public path, not from
 * the bundler.
 *
 * Two reasons:
 *
 *   1. A CSS `import` in any module makes the bundler hoist the
 *      stylesheet into the page's CSS bundle, so every dish page
 *      downloads it — even with the pilot off. The rules are scoped to
 *      `.dj--v2` so they were inert, but a public page still fetched
 *      them.
 *   2. A file in `public/` has a fixed, known URL, so it can be linked
 *      at runtime without the bundler knowing about it at all.
 *
 * The link is added only when the pilot actually renders, so with the
 * pilot off no public page requests it.
 */
const PILOT_STYLE_HREF = "/pilot/dish-journey-v2.css";

export function ensurePilotStyles(): void {
  if (!PILOT_STYLE_HREF) return;
  if (document.querySelector("link[data-gus238-pilot]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = PILOT_STYLE_HREF;
  link.dataset.gus238Pilot = "1";
  document.head.appendChild(link);
}
