/**
 * The relationship grammar — how the four kinds of connection are shown.
 *
 * WHY FOUR GROUPS
 *
 * The vocabulary has THIRTEEN relation types. Seven are in use. Drawing
 * seven different edge styles would be unreadable, and seven colours
 * would fail anyone who cannot separate them. So the types are grouped
 * into four kinds, and each KIND gets its own visual grammar.
 *
 * The grouping is by SEMANTIC KIND, not by convenience:
 *
 *   1. family        — the two dishes belong to the same tradition.
 *                       Undirected. The strongest claim.
 *   2. likeness      — the two dishes resemble each other: same form,
 *                       same serving, same technique, same ingredient.
 *                       Undirected.
 *   3. descent       — one dish descends from the other: an ancestor,
 *                       a development, an adaptation, an influence.
 *                       DIRECTED: the arrow points from the ancestor to
 *                       the descendant.
 *   4. migration     — one dish travelled: a diaspora, a regional
 *                       variant. DIRECTED: the arrow points from the
 *                       origin to the place it went.
 *
 * The two undirected groups differ from each other in CLAIM KIND, not
 * in direction — and that is exactly why they must not look alike.
 * "These are the same family" and "these merely resemble each other"
 * are different assertions, and a reader who cannot tell them apart
 * will over-read one of them.
 *
 * EVERY GROUP IS DISTINGUISHED BY MORE THAN COLOUR
 *
 * Colour is the last thing, not the first. Each group differs in:
 *
 *   - the SHAPE of the line      (solid / dashed / dotted / double)
 *   - the DIRECTION treatment    (arrow / no arrow)
 *   - the TEXT of the label      (each group has its own wording)
 *   - the PATTERN of the marker  (how a connection is picked out in
 *                                 a legend, a list, and on the map)
 *
 * A reader who cannot distinguish the colours still reads the map
 * correctly. That is the requirement: colour alone is never the carrier.
 */

// ─── The four groups ──────────────────────────────────────────────────────

export type RelationshipKind = "family" | "likeness" | "descent" | "migration";

/**
 * The thirteen relation types, mapped to their group.
 *
 * The mapping is data, not branching logic: adding a relation type is a
 * one-line change, and a type that is not mapped is a HARD ERROR at
 * render time rather than a silently invisible edge.
 */
const KIND_BY_RELATION: Record<string, RelationshipKind> = {
  // 1 — family: same tradition, one claim about belonging.
  family: "family",

  // 2 — likeness: resemblance, several kinds of it.
  similar_form: "likeness",
  similar_technique: "likeness",
  // THE VOCABULARY IS INCONSISTENT: two of the thirteen slugs use a
  // HYPHEN where the other eleven use an underscore. The live data
  // has both spellings in use — `similar_form` and `similar-serving`.
  //
  // An earlier version of this map used only the underscore spelling,
  // and the two hyphenated types were therefore UNCLASSIFIED: the
  // legend silently dropped their counts (9 connections), the map
  // silently skipped their edges, and nothing anywhere said so. A
  // vocabulary that spells itself two ways must be accepted both ways.
  "similar-serving": "likeness",
  similar_serving: "likeness",
  "shared-ingredient": "likeness",
  shared_ingredient: "likeness",

  // 3 — descent: one dish came from the other.
  ancestor: "descent",
  developed_from: "descent",
  adapted_from: "descent",
  influenced_by: "descent",

  // 4 — migration: one dish travelled from one place to another.
  diaspora: "migration",
  regional_variant_of: "migration",

  // Not a kind of its own: a proposed connection whose direction is
  // not established. It is rendered as an UNDIRECTED line of the
  // likeness group, and it is marked as provisional in the text.
  // `connection_proposed` is NOT in this map — a proposed connection
  // does not know which kind it is yet, and guessing would assert a
  // claim the data does not make.
};

/**
 * The visual grammar of each group.
 *
 * `pattern` is the line's dash pattern. A DASHED line reads as
 * "provisional" to almost everyone; a DOTTED line reads as
 * "peripheral". Using them as the primary carrier of two distinct
 * meanings is exactly the kind of convention a map should not invent
 * silently — so each is named in the legend text.
 */
export interface RelationshipStyle {
  readonly kind: RelationshipKind;
  /** The group's plain-language name, as it appears in the legend. */
  readonly label: string;
  /** One sentence: what a line of this kind asserts. */
  readonly meaning: string;
  /** The dash pattern for the line. Empty = solid. */
  readonly pattern: readonly number[];
  /** Does the line carry a direction arrow? */
  readonly arrow: boolean;
  /** The hex colour. The LAST channel, not the first. */
  readonly colour: string;
  /**
   * The TEXT of the label that sits on the edge. This is what a reader
   * reads when the colour is invisible to them.
   */
  readonly edgeText: string;
  /**
   * The marker used in a legend and in a list — a shape that survives
   * being printed in one colour.
   */
  readonly marker: "solid-dot" | "double-dot" | "arrow" | "ring";
  /** The order the legend lists this group in. */
  readonly order: number;
}

export const RELATIONSHIP_STYLES: Record<RelationshipKind, RelationshipStyle> =
  {
    family: {
      kind: "family",
      label: "Same family",
      meaning:
        "Both dishes belong to the same culinary tradition — the strongest claim of the four.",
      pattern: [],
      arrow: false,
      colour: "#c9a227",
      edgeText: "same family",
      marker: "solid-dot",
      order: 1,
    },
    likeness: {
      kind: "likeness",
      label: "Resemblance",
      meaning:
        "The dishes resemble each other in form, serving, technique or ingredient — without belonging to one tradition.",
      pattern: [2, 2],
      arrow: false,
      colour: "#4a9dab",
      edgeText: "resembles",
      marker: "double-dot",
      order: 2,
    },
    descent: {
      kind: "descent",
      label: "Descent",
      meaning:
        "One dish came from the other. The arrow points from the ancestor to the descendant.",
      pattern: [6, 3],
      arrow: true,
      colour: "#b5651d",
      edgeText: "descends from",
      marker: "arrow",
      order: 3,
    },
    migration: {
      kind: "migration",
      label: "Migration",
      meaning:
        "One dish travelled from its origin to another place. The arrow points from the origin outward.",
      pattern: [1, 3],
      arrow: true,
      colour: "#7b6cae",
      edgeText: "travelled to",
      marker: "ring",
      order: 4,
    },
  };

/** The groups, in legend order. */
export const RELATIONSHIP_KINDS: RelationshipKind[] = (
  Object.keys(RELATIONSHIP_STYLES) as RelationshipKind[]
).sort((a, b) => RELATIONSHIP_STYLES[a].order - RELATIONSHIP_STYLES[b].order);

/**
 * The group a relation type belongs to.
 *
 * Throws on an unmapped type rather than returning a default. A new
 * relation type that nobody classified must break the build, because
 * the alternative is an edge on the map that no legend entry explains —
 * which is how a map stops being readable.
 */
export function relationshipKindFor(relationType: string): RelationshipKind {
  const kind = KIND_BY_RELATION[relationType];
  if (!kind) {
    throw new Error(
      `the relation type "${relationType}" is not classified into a relationship group. ` +
        `Add it to KIND_BY_RELATION in apps/web/src/lib/relationship-grammar.ts — ` +
        `every type on the map must be explained by the legend.`,
    );
  }
  return kind;
}

/**
 * The style for a relation type.
 */
export function relationshipStyleFor(relationType: string): RelationshipStyle {
  return RELATIONSHIP_STYLES[relationshipKindFor(relationType)];
}

/**
 * The sentence a connection asserts, for the non-visual reading of it.
 *
 * The wording differs per group on purpose: "same family" is an
 * assertion about belonging, "resembles" is an assertion about
 * appearance, "descends from" is an assertion about history. The edge
 * TEXT says which one is being made.
 */
export function relationshipSentence(
  relationType: string,
  sourceName: string,
  targetName: string,
  directionKnown: boolean,
): string {
  const style = relationshipStyleFor(relationType);

  // A connection whose direction is not established makes NO
  // directional claim — not even a weak one. This is the case
  // `connection_proposed` exists for, and the API flags it with
  // `directionKnown: false`.
  if (!directionKnown) {
    return `${sourceName} and ${targetName} are connected, in a direction that is not established.`;
  }

  switch (style.kind) {
    case "family":
      return `${sourceName} and ${targetName} belong to the same family.`;
    case "likeness":
      return `${sourceName} resembles ${targetName}.`;
    case "descent":
      return `${targetName} descends from ${sourceName}.`;
    case "migration":
      return `${targetName} travelled from ${sourceName}.`;
  }
}

/**
 * The CSS dash string for a style, for use in an SVG or a CSS border.
 */
export function dashStringFor(style: RelationshipStyle): string {
  return style.pattern.length ? style.pattern.join(" ") : "none";
}
