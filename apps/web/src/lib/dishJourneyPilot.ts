/**
 * The dish-journey presentation pilot (GUS-238).
 *
 * WHY THIS FILE EXISTS
 *
 * The new presentation — one map per chapter, a visible lineage section,
 * a sticky section nav — must not appear on the public site until it
 * has been reviewed. So it is gated:
 *
 *   * `PILOT_ENABLED` is OFF by default. The production build therefore
 *     renders the EXISTING presentation and nothing changes for any
 *     visitor until the switch is deliberately turned on.
 *   * `PILOT_SLUGS` is the allowlist of dishes the pilot may touch.
 *     A dish outside the allowlist keeps the old presentation even if
 *     the switch is on, so turning the switch on cannot silently
 *     republish every dish page.
 *   * The pilot fixtures live in `dishJourneyFixtures.ts`, a SEPARATE
 *     module from every production data path. They are review material
 *     for the five documented cases, never live content.
 *
 * The switch is read from the build environment so a reviewer can turn
 * the pilot on for a local build without editing source:
 *
 *   PUBLIC_DISH_JOURNEY_PILOT=1 pnpm --filter @gustale/web build:geo
 *
 * Domain isolation: the pilot is Atlas-only. The Recipes site serves
 * its own pages and must not gain the Atlas dish journey, so
 * `isPilotDish` returns false whenever the build is not the Atlas.
 */

import { isGeoDomain } from "./domain";

/**
 * The pilot switch. OFF unless the environment explicitly enables it.
 *
 * Read defensively: `import.meta.env` is a Vite/Astro construct and is
 * absent when this module is evaluated outside a bundler (a plain Node
 * test run, for example). `import.meta.env?.` keeps the module usable
 * in both contexts, and the switch still resolves to OFF when the
 * variable is missing.
 */
export const PILOT_ENABLED: boolean =
  (import.meta.env as Record<string, string | undefined> | undefined)
    ?.PUBLIC_DISH_JOURNEY_PILOT === "1";

/**
 * The dishes the pilot may present.
 *
 * "bibimbap" and "moussaka-greek" are the two-dish application pilot
 * from the brief. The other three entries are the review-coverage
 * cases: a historical fixture and two explicit research gaps. They are
 * here so the fixture module can be exercised end to end; they are not
 * production records and they are not published.
 */
export const PILOT_SLUGS: readonly string[] = [
  "bibimbap",
  "moussaka-greek",
  "chongqing-hot-pot",
  "century-egg-tofu",
  "beyaynetu",
];

/**
 * True when this dish should use the new presentation.
 *
 * Three conditions, all required:
 *   1. the switch is on,
 *   2. this is the Atlas (the Recipes site is untouched),
 *   3. the dish is in the pilot allowlist.
 */
export function isPilotDish(slug: string): boolean {
  if (!PILOT_ENABLED) return false;
  if (!isGeoDomain()) return false;
  return PILOT_SLUGS.includes(slug);
}

/**
 * True when the pilot presentation machinery should be BUILT at all.
 *
 * Separate from `isPilotDish`: when the switch is off, the pilot code
 * (the fixtures, the map cards, the extra CSS) is not bundled into the
 * production build at all. That is what "no demonstration data can leak
 * into a public build" means in practice.
 */
export function pilotEnabled(): boolean {
  return PILOT_ENABLED && isGeoDomain();
}
