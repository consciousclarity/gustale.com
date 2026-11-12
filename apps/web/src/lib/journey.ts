/**
 * Journey presentation semantics (GUS-238).
 *
 * Pure functions. No React, no DOM, no I/O — so the editorial rules
 * about dates, evidence and lineage relationships are unit-testable
 * without a browser or a database.
 *
 * The rules this module encodes:
 *
 *  * A date keeps the PRECISION its source supports. "1810", "c. 1810",
 *    "1810-1820", "late 19th century", "1930s" and "unknown" are all
 *    representable, and a missing date is never rendered as 0, the
 *    current year, or the source's publication year.
 *  * BCE dates display without a year zero.
 *  * An unknown date keeps the editorial order of the chapter.
 *  * Confidence and evidence type are different things and are
 *    labelled differently.
 *  * A lineage role that is not directional means "a related dish in
 *    this lineage" — never an ancestor or descendant arrow.
 *  * A movement is drawn only when a source supports it.
 */

import type {
  DishJourneyBeat,
  DishJourneyDatePrecision,
  DishJourneyEvidenceKind,
  DishJourneyLineage,
  DishJourneyMovement,
  DishJourneyPlaceRole,
} from "../lib/api";

export type { DishJourneyBeat, DishJourneyMovement, DishJourneyLineage };

/**
 * The beat type under the name the existing P1-1 components already
 * import. Kept as an alias so nothing outside this feature has to
 * change its import.
 */
export type JourneyBeat = DishJourneyBeat;

/**
 * The confidence enum, unchanged.
 *
 * The DB CHECK constraint and this union both read
 * ('documented','likely','possible','parallel'). The redesign brief is
 * explicit that this enum is NOT extended merely to change badge
 * wording — evidence type lives in its own field instead.
 */
export type JourneyConfidence =
  | "documented"
  | "likely"
  | "possible"
  | "parallel";

/**
 * A minimal lineage reference — the shape the existing P1-1
 * presentation uses for its single lineage sentence.
 */
export interface JourneyLineageLink {
  slug: string;
  name: string;
}

// ─── Dates ───────────────────────────────────────────────────────────────

/**
 * Render a chapter's date at the precision the source supports.
 *
 * `dateLabel` is the editor's own wording and wins when present — it is
 * the only place a range or a century can be expressed faithfully. The
 * `yearApprox` integer is the machine anchor used when no label exists.
 */
export function formatJourneyDate(
  beat: Pick<DishJourneyBeat, "dateLabel" | "yearApprox" | "datePrecision">,
): string | null {
  if (beat.dateLabel && beat.dateLabel.trim()) return beat.dateLabel.trim();
  if (beat.yearApprox == null) return null;

  const precision: DishJourneyDatePrecision = beat.datePrecision ?? "exact";
  const year = beat.yearApprox;

  // BCE: there is no year zero, and the sign must read as "before".
  if (precision === "bce" || year < 0) {
    const abs = Math.abs(year);
    return precision === "circa" ? `c. ${abs} BCE` : `${abs} BCE`;
  }
  if (precision === "ce" && year <= 0) {
    // A CE year of 0 would be a year zero, which does not exist.
    return "1 CE";
  }
  if (precision === "circa") return `c. ${year}`;
  if (precision === "century") {
    const century = Math.floor((year - 1) / 100) + 1;
    const ordinal = centurySuffix(century);
    return `${ordinal} century`;
  }
  if (precision === "decade") {
    return `${Math.floor(year / 10) * 10}s`;
  }
  return String(year);
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function centurySuffix(century: number): string {
  const rem100 = century % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${century}th`;
  switch (century % 10) {
    case 1:
      return `${century}st`;
    case 2:
      return `${century}nd`;
    case 3:
      return `${century}rd`;
    default:
      return `${century}th`;
  }
}

/**
 * True when the chapter has no datable evidence at all.
 *
 * A chapter with no date keeps its editorial position — it is not
 * dropped and it is not pushed to the end.
 */
export function hasJourneyDate(
  beat: Pick<DishJourneyBeat, "dateLabel" | "yearApprox">,
): boolean {
  return Boolean(beat.dateLabel && beat.dateLabel.trim()) || beat.yearApprox != null;
}

// ─── Evidence ────────────────────────────────────────────────────────────

/**
 * The badge for a chapter's evidence type.
 *
 * These describe the KIND of record, never a claim of settled origin.
 */
export const EVIDENCE_KIND_LABELS: Record<DishJourneyEvidenceKind, string> = {
  primary_record: "Primary record",
  scholarly_interpretation: "Scholarly interpretation",
  reported_account: "Reported account",
  reference_work: "Reference work",
  archival_record: "Archival record",
  comparison: "Comparison",
};

/**
 * The badge for the confidence value.
 *
 * Kept separate from the evidence badge on purpose: "documented" says
 * how sure we are, "Primary record" says what the chapter rests on.
 */
export const CONFIDENCE_LABELS: Record<
  "documented" | "likely" | "possible" | "parallel",
  string
> = {
  documented: "Documented",
  likely: "Likely",
  possible: "Possible",
  parallel: "Parallel tradition",
};

/** The role the place plays in the chapter. */
export const PLACE_ROLE_LABELS: Record<DishJourneyPlaceRole, string> = {
  attestation: "Name attestation",
  preparation_context: "Preparation context",
  adaptation: "Adaptation",
  reception: "Reception",
  circulation: "Circulation",
  regional_identity: "Regional identity",
};

/**
 * How the place role is worded in the chapter meta line.
 *
 * "Where this dish moved" would be a claim about movement; the role
 * says what the RECORD is about instead.
 */
export const PLACE_ROLE_PHRASES: Record<DishJourneyPlaceRole, string> = {
  attestation: "name record",
  preparation_context: "preparation record",
  adaptation: "adaptation",
  reception: "reception",
  circulation: "circulation",
  regional_identity: "regional identity",
};

// ─── Lineage ─────────────────────────────────────────────────────────────

/**
 * Roles that assert a DIRECTION between this dish and the lineage.
 *
 * Only these may be shown with an ancestor/descendant reading. Every
 * other role is a grouping or a parallel relationship, and the UI must
 * label it as such rather than inventing an ancestor.
 */
export const DIRECTIONAL_LINEAGE_ROLES = [
  "ancestor",
  "descendant",
] as const;

export type DirectionalLineageRole = (typeof DIRECTIONAL_LINEAGE_ROLES)[number];

export function isDirectionalLineageRole(
  role: DishJourneyLineage["role"],
): role is DirectionalLineageRole {
  return (DIRECTIONAL_LINEAGE_ROLES as readonly string[]).includes(role);
}

/**
 * The relationship wording for a lineage membership.
 *
 * A directional role gets an explicit statement. Everything else is
 * described as a relationship within the grouping, which is what the
 * data actually records.
 */
export function lineageRoleLabel(
  lineage: Pick<DishJourneyLineage, "role" | "name">,
): string {
  switch (lineage.role) {
    case "ancestor":
      return `An ancestor of the ${lineage.name} lineage`;
    case "descendant":
      return `A descendant of the ${lineage.name} lineage`;
    case "regional_variant":
      return `A regional variant within the ${lineage.name} lineage`;
    case "adaptation":
      return `An adaptation within the ${lineage.name} lineage`;
    case "fusion":
      return `A fusion within the ${lineage.name} lineage`;
    case "diaspora_adaptation":
      return `A diaspora adaptation within the ${lineage.name} lineage`;
    case "trade_route_spread":
      return `A trade-route relative within the ${lineage.name} lineage`;
    case "colonial_spread":
      return `A colonial-spread relative within the ${lineage.name} lineage`;
    case "technique_relative":
      return `A technique relative within the ${lineage.name} lineage`;
    case "ingredient_relative":
      return `An ingredient relative within the ${lineage.name} lineage`;
    case "possible_influence":
      return `Possibly influential on the ${lineage.name} lineage`;
    case "parallel_evolution":
      return `A parallel tradition to the ${lineage.name} lineage`;
    case "cousin":
      return `A cousin dish in the ${lineage.name} lineage`;
    default:
      // "uncertain" and any role added later fall back to the neutral
      // wording: "related to", which claims nothing about descent.
      return `Related to the ${lineage.name} lineage`;
  }
}

/**
 * The heading wording for a lineage's related dishes.
 *
 * When the role is directional the members are "the dishes in this
 * lineage". When it is not, they are "related dishes in this lineage" —
 * the honest reading of a grouping.
 */
export function lineageMembersLabel(
  lineage: Pick<DishJourneyLineage, "role" | "name">,
): string {
  return isDirectionalLineageRole(lineage.role)
    ? `Dishes in the ${lineage.name} lineage`
    : `Related dishes in the ${lineage.name} lineage`;
}

// ─── Movements ───────────────────────────────────────────────────────────

/**
 * Movements that may be drawn on a map.
 *
 * A movement is drawable only when it names two chapters that both
 * have coordinates and it carries a source. Anything else is shown as
 * text only — a line on a map is a claim, and an unsourced claim is
 * not drawn.
 */
export interface DrawableMovement {
  movement: DishJourneyMovement;
  from: DishJourneyBeat;
  to: DishJourneyBeat;
}

export function drawableMovements(
  beats: DishJourneyBeat[],
  movements: DishJourneyMovement[],
): DrawableMovement[] {
  const byId = new Map(beats.map((b) => [b.id, b]));
  const out: DrawableMovement[] = [];
  for (const movement of movements) {
    const from = byId.get(movement.fromBeatId);
    const to = byId.get(movement.toBeatId);
    if (!from || !to) continue;
    if (typeof from.lat !== "number" || typeof from.lng !== "number") continue;
    if (typeof to.lat !== "number" || typeof to.lng !== "number") continue;
    if (!movement.source) continue;
    out.push({ movement, from, to });
  }
  return out;
}

// ─── Map framing ─────────────────────────────────────────────────────────

export interface MapFrame {
  center: [number, number];
  zoom: number;
}

/**
 * Frame a chapter's map around whatever geography it actually has.
 *
 * A chapter with a point is framed on that point. A chapter with only
 * broad regional bounds is framed on the bounds and zoomed out. A
 * chapter with neither gets a wide default frame — never a guessed
 * capital-city pin.
 */
export function frameForBeat(
  beat: Pick<DishJourneyBeat, "lat" | "lng" | "bounds">,
): MapFrame {
  const bounds = beat.bounds ?? [];
  const hasBounds =
    bounds.length === 4 &&
    bounds.every((n) => typeof n === "number" && Number.isFinite(n));

  if (typeof beat.lat === "number" && typeof beat.lng === "number") {
    if (!hasBounds) return { center: [beat.lng, beat.lat], zoom: 5.5 };
    const [w, s, e, n] = bounds as [number, number, number, number];
    const span = Math.max(e - w, n - s);
    // A point inside a broad region zooms out to show the region.
    const zoom = span > 30 ? 2.6 : span > 10 ? 3.6 : 4.6;
    return { center: [(w + e) / 2, (s + n) / 2], zoom };
  }

  if (hasBounds) {
    const [w, s, e, n] = bounds as [number, number, number, number];
    const span = Math.max(e - w, n - s);
    return { center: [(w + e) / 2, (s + n) / 2], zoom: span > 30 ? 2.6 : 3.6 };
  }

  // No geography at all: a wide, neutral frame that shows context
  // without implying a location.
  return { center: [0, 20], zoom: 1.4 };
}

/**
 * True when a chapter has enough geography to deserve its own map.
 *
 * A chapter with neither a point nor bounds still gets a card — with
 * its text and citation — but the map area is replaced by an explicit
 * "no location recorded" note rather than an empty canvas.
 */
export function beatHasGeography(
  beat: Pick<DishJourneyBeat, "lat" | "lng" | "bounds">,
): boolean {
  if (typeof beat.lat === "number" && typeof beat.lng === "number") return true;
  const bounds = beat.bounds ?? [];
  return bounds.length === 4 && bounds.every((n) => typeof n === "number");
}

/**
 * The caption under a chapter's map.
 *
 * States the PRECISION of the geography, so a city marker is never
 * read as an invention site and a regional frame is never read as a
 * boundary.
 */
export function mapCaptionForBeat(
  beat: Pick<DishJourneyBeat, "placeName" | "placeRole" | "lat" | "lng" | "bounds">,
): string {
  const hasBounds =
    (beat.bounds?.length ?? 0) === 4 &&
    (beat.bounds ?? []).every((n) => typeof n === "number");
  const hasPoint = typeof beat.lat === "number" && typeof beat.lng === "number";

  if (hasPoint && !hasBounds) {
    return `${beat.placeName} · approximate city location, not a place of invention`;
  }
  if (hasPoint && hasBounds) {
    return `${beat.placeName} · recorded place within the region shown`;
  }
  if (!hasPoint && hasBounds) {
    return `${beat.placeName} · regional reference, exact record location unresolved`;
  }
  return `${beat.placeName} · no location recorded for this record`;
}
