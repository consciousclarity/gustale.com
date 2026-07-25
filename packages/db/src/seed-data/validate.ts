/**
 * Seed-data validator — fail loud on content bugs the seeder used to skip.
 *
 * Usage:
 *   pnpm --filter @gustale/db run validate
 *   SEED_ALLOW_ORPHANS=1 pnpm --filter @gustale/db run validate
 *
 * Called at the top of seed.ts before any DB write. Reference errors
 * (checks 3–5) become warnings when SEED_ALLOW_ORPHANS=1 so known orphans
 * do not block local seed work until the cleanup pass lands.
 *
 * DB invariants (migration 0009 / dish_journey_beats 0008) also enforce:
 *   - dish lat/lng ranges once written as origin_location geometry (check 8)
 *   - journey confidence enum (check 9)
 *   - journey sequence >= 1 and UNIQUE(dish_id, sequence)
 * The validator still runs these against the seed *source* so bad content
 * fails before a DB round-trip. Contiguous sequences (1..N with no gaps)
 * and cross-file slug refs remain seed-only — the DB cannot express them.
 */

import { pathToFileURL } from "node:url";
import { CUISINE_CATEGORIES, DISH_TYPE_CATEGORIES } from "./categories.js";
import { DISHES } from "./dishes.js";
import { JOURNEY_BEATS } from "./journeys.js";
import { DISH_LINEAGES } from "./lineages.js";
import { DISH_RELATIONS } from "./relations.js";
import type { JourneyConfidenceSeed } from "./types.js";

const JOURNEY_CONFIDENCE: ReadonlySet<JourneyConfidenceSeed> = new Set([
  "documented",
  "likely",
  "possible",
  "parallel",
]);

export type SeedValidationSeverity = "error" | "warning";

export interface SeedValidationIssue {
  check: number;
  group: string;
  severity: SeedValidationSeverity;
  message: string;
}

export interface SeedValidationResult {
  ok: boolean;
  issues: SeedValidationIssue[];
  allowOrphans: boolean;
}

export interface ValidateSeedDataOptions {
  /** Downgrade checks 3–5 (orphan references) to warnings. */
  allowOrphans?: boolean;
}

function envAllowOrphans(): boolean {
  const v = process.env.SEED_ALLOW_ORPHANS;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Validate the curated seed dataset. Does not touch a database.
 */
export function validateSeedData(
  options: ValidateSeedDataOptions = {},
): SeedValidationResult {
  const allowOrphans = options.allowOrphans ?? envAllowOrphans();
  const issues: SeedValidationIssue[] = [];

  const push = (
    check: number,
    group: string,
    severity: SeedValidationSeverity,
    message: string,
  ) => {
    issues.push({ check, group, severity, message });
  };

  const orphanSeverity: SeedValidationSeverity = allowOrphans
    ? "warning"
    : "error";

  const dishSlugs = new Set<string>();
  const cuisineSlugs = new Set(CUISINE_CATEGORIES.map((c) => c.slug));
  const dishTypeSlugs = new Set(DISH_TYPE_CATEGORIES.map((c) => c.slug));

  // 1. No duplicate slugs in DISHES
  for (const d of DISHES) {
    if (dishSlugs.has(d.slug)) {
      push(1, "duplicate-slugs", "error", `Duplicate dish slug: ${d.slug}`);
    }
    dishSlugs.add(d.slug);
  }

  // 2. Every dish has a non-empty wikipediaSlug (source trail at seed time)
  //    Seed dishes have no separate sources array — wikipediaSlug is the
  //    citation input. An empty slug = unsourced stub (roadmap non-goal).
  for (const d of DISHES) {
    if (!d.wikipediaSlug || d.wikipediaSlug.trim() === "") {
      push(
        2,
        "unsourced-dishes",
        "error",
        `Dish "${d.slug}" has empty wikipediaSlug (unsourced stub)`,
      );
    }
  }

  // 3. Every DISH_RELATIONS referenced slug exists in DISHES
  for (const [i, r] of DISH_RELATIONS.entries()) {
    if (!dishSlugs.has(r.from)) {
      push(
        3,
        "dish-relations-orphans",
        orphanSeverity,
        `DISH_RELATIONS[${i}] from="${r.from}" not in DISHES (→ ${r.to})`,
      );
    }
    if (!dishSlugs.has(r.to)) {
      push(
        3,
        "dish-relations-orphans",
        orphanSeverity,
        `DISH_RELATIONS[${i}] to="${r.to}" not in DISHES (← ${r.from})`,
      );
    }
  }

  // 4. Every DISH_LINEAGES key exists in DISHES
  for (const dishSlug of Object.keys(DISH_LINEAGES)) {
    if (!dishSlugs.has(dishSlug)) {
      push(
        4,
        "dish-lineages-orphans",
        orphanSeverity,
        `DISH_LINEAGES key "${dishSlug}" not in DISHES`,
      );
    }
  }

  // 5. Every JOURNEY_BEATS key exists in DISHES
  for (const dishSlug of Object.keys(JOURNEY_BEATS)) {
    if (!dishSlugs.has(dishSlug)) {
      push(
        5,
        "journey-beats-orphans",
        orphanSeverity,
        `JOURNEY_BEATS key "${dishSlug}" not in DISHES`,
      );
    }
  }

  // 6. Every dish cuisineSlug exists in CUISINE_CATEGORIES
  for (const d of DISHES) {
    if (!cuisineSlugs.has(d.cuisineSlug)) {
      push(
        6,
        "unknown-cuisine",
        "error",
        `Dish "${d.slug}" cuisineSlug "${d.cuisineSlug}" not in CUISINE_CATEGORIES`,
      );
    }
  }

  // 7. Every dishTypes entry exists in DISH_TYPE_CATEGORIES
  for (const d of DISHES) {
    for (const t of d.dishTypes) {
      if (!dishTypeSlugs.has(t)) {
        push(
          7,
          "unknown-dish-type",
          "error",
          `Dish "${d.slug}" dishType "${t}" not in DISH_TYPE_CATEGORIES`,
        );
      }
    }
  }

  // 8. lat / lng in range and non-null (seed source).
  //    DB also CHECK-constrains origin_location bounds after insert (0009).
  for (const d of DISHES) {
    if (d.lat == null || d.lng == null) {
      push(
        8,
        "invalid-coordinates",
        "error",
        `Dish "${d.slug}" has null lat/lng`,
      );
      continue;
    }
    if (
      typeof d.lat !== "number" ||
      Number.isNaN(d.lat) ||
      d.lat < -90 ||
      d.lat > 90
    ) {
      push(
        8,
        "invalid-coordinates",
        "error",
        `Dish "${d.slug}" lat ${d.lat} out of [-90, 90]`,
      );
    }
    if (
      typeof d.lng !== "number" ||
      Number.isNaN(d.lng) ||
      d.lng < -180 ||
      d.lng > 180
    ) {
      push(
        8,
        "invalid-coordinates",
        "error",
        `Dish "${d.slug}" lng ${d.lng} out of [-180, 180]`,
      );
    }
  }

  // 9 + 10. Journey beat confidence + contiguous sequences from 1.
  //    DB enforces confidence enum (0008) and sequence >= 1 +
  //    UNIQUE(dish_id, sequence) (0009). Contiguity (no gaps) stays here.
  for (const [dishSlug, beats] of Object.entries(JOURNEY_BEATS)) {
    for (const beat of beats) {
      if (!JOURNEY_CONFIDENCE.has(beat.confidence)) {
        push(
          9,
          "journey-confidence",
          "error",
          `JOURNEY_BEATS["${dishSlug}"] sequence ${beat.sequence}: confidence "${beat.confidence}" not in documented|likely|possible|parallel`,
        );
      }
    }
    const sequences = beats.map((b) => b.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      const expected = i + 1;
      if (sequences[i] !== expected) {
        push(
          10,
          "journey-sequences",
          "error",
          `JOURNEY_BEATS["${dishSlug}"] sequences ${JSON.stringify(sequences)} are not contiguous from 1`,
        );
        break;
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { ok: !hasErrors, issues, allowOrphans };
}

/** Print a grouped report to stdout/stderr. Returns process exit code. */
export function reportSeedValidation(result: SeedValidationResult): number {
  const byGroup = new Map<string, SeedValidationIssue[]>();
  for (const issue of result.issues) {
    const list = byGroup.get(issue.group) ?? [];
    list.push(issue);
    byGroup.set(issue.group, list);
  }

  if (result.issues.length === 0) {
    console.log("seed-data: OK — no violations");
    return 0;
  }

  console.log(
    `seed-data: ${result.issues.length} issue(s)` +
      (result.allowOrphans
        ? " (SEED_ALLOW_ORPHANS=1 — ref orphans are warnings)"
        : ""),
  );
  console.log("");

  for (const [group, groupIssues] of byGroup) {
    const sev = groupIssues.some((i) => i.severity === "error")
      ? "ERROR"
      : "WARN";
    console.log(`── ${sev} ${group} (${groupIssues.length}) ──`);
    for (const issue of groupIssues) {
      console.log(`  [check ${issue.check}] ${issue.message}`);
    }
    console.log("");
  }

  if (!result.ok) {
    console.error(
      "seed-data: FAILED — fix violations before seeding (or set SEED_ALLOW_ORPHANS=1 for checks 3–5 only)",
    );
    return 1;
  }

  console.log("seed-data: OK — warnings only (no hard errors)");
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const code = reportSeedValidation(validateSeedData());
  process.exit(code);
}
