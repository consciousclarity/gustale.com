/**
 * The "Places & traditions" section of the dish page.
 *
 * WHY THIS EXISTS
 *
 * The brief's §5 (D1, D3) says the three concepts stay separate, and
 * the dish page must read in the brief's six-part order:
 *
 *   names and aliases, image, description;
 *   PLACES & TRADITIONS with emergence, tradition, documentation and
 *   spread kept SEPARATE;
 *   food families grouped by dimension;
 *   history & connections as complete sentences;
 *   regional variants;
 *   sources and contribution info.
 *
 * The page already had an "Origin" band, and that band was the defect
 * the ADR recorded: it asserted a SETTLED origin for a dish whose own
 * journey says the origin is contested. falafel's page said "Origin
 * Israel" directly above a journey that said the origin is contested
 * between Egypt and the Levant.
 *
 * So this section REPLACES the "Origin" band, and it:
 *
 *   - reads the atlas API, which serves only PUBLISHED associations;
 *   - keeps the relationship types SEPARATE, because
 *     "established_tradition" and "historical_emergence" are different
 *     claims and merging them into one "Origin" line is what made the
 *     old band wrong;
 *   - says "Associated with" and never "Origin", because an association
 *     does not establish an origin (ADR-004 §10);
 *   - shows the legacy value under its own heading, marked as
 *     discovery data, so the reader sees both the typed associations
 *     AND the raw value with its warning;
 *   - shows NOTHING when there is nothing published, and says why,
 *     rather than rendering an empty section.
 *
 * THE ORDER IS FIXED AND DOES NOT IMPLY PRIORITY
 *
 * The types appear in a fixed order — emergence, tradition,
 * documentation, spread — because a reader scanning the list needs a
 * consistent order. It is PRESENTATION metadata and never implies that
 * one association is better evidenced than another. The evidence badge
 * on each row is what says that.
 */

import { useEffect, useState } from "react";
import type { AtlasAssociation, AtlasResponse } from "../lib/api";
import { ApiError, getDishAtlas } from "../lib/api";

// ─── The relationship types, in presentation order ───────────────────────
//
// ADR-004 D3's six types. The four the brief's reading order names are
// grouped under headings; the two that are not place claims at all
// ('legacy_unreviewed' is the migration's own label, and
// 'established_tradition' is the community one) are handled separately.
//
// The GROUPING is what keeps emergence, tradition, documentation and
// spread separate — they are four different claims about a dish, and
// the old band collapsed them into one "Origin" line.

type Group = {
  id: string;
  /** The heading. */
  label: string;
  /** The relationship types that belong to this group. */
  types: string[];
  /** One line saying what the group means. */
  note: string;
};

const GROUPS: Group[] = [
  {
    id: "emergence",
    label: "Historical emergence",
    types: ["historical_emergence"],
    note: "Where the dish is thought to have come into being.",
  },
  {
    id: "tradition",
    label: "Established tradition",
    types: ["established_tradition"],
    note: "The cuisine or culinary tradition the dish belongs to.",
  },
  {
    id: "documentation",
    label: "Earliest documentation",
    types: ["earliest_documentation"],
    note: "When the dish was first written down.",
  },
  {
    id: "spread",
    label: "Regional adaptation and spread",
    types: ["regional_adaptation", "later_introduction"],
    note: "Where the dish travelled to, and how it changed there.",
  },
];

// The badge wording, per evidence state. The brief forbids a
// numerical confidence score, so the evidence is a WORD.
const EVIDENCE_LABEL: Record<string, string> = {
  evidenced: "Evidenced",
  provisional: "Proposed",
  research_pending: "Being researched",
  unevidenced: "Not yet evidenced",
};

const EVIDENCE_CLASS: Record<string, string> = {
  evidenced: "atlas-evidence--evidenced",
  provisional: "atlas-evidence--provisional",
  research_pending: "atlas-evidence--pending",
  unevidenced: "atlas-evidence--unevidenced",
};

function EvidenceBadge({ association }: { association: AtlasAssociation }) {
  const status = association.evidence.status;
  return (
    <span
      className={`atlas-evidence ${EVIDENCE_CLASS[status] ?? EVIDENCE_CLASS.unevidenced}`}
    >
      {EVIDENCE_LABEL[status] ?? status}
    </span>
  );
}

/**
 * One association, rendered.
 *
 * A COMMUNITY is not a place and is not rendered as one: a tradition or
 * a people gets its own line, and a place gets its ISO code and its
 * entity type. The brief's F8 is exactly the confusion of the two.
 */
function AssociationRow({ association }: { association: AtlasAssociation }) {
  const isPlace = association.entityKind === "place";
  return (
    <li className="atlas-association">
      <div className="atlas-association__main">
        <span className="atlas-association__name">
          {association.name ?? "Unknown"}
        </span>
        {isPlace && association.isoCode ? (
          <span className="atlas-association__meta">
            · {association.isoCode}
          </span>
        ) : null}
        {!isPlace ? (
          <span className="atlas-association__kind">community</span>
        ) : null}
        {isPlace &&
        association.placeEntityType &&
        association.placeEntityType !== "country" ? (
          <span className="atlas-association__kind">
            {association.placeEntityType}
          </span>
        ) : null}
      </div>
      <EvidenceBadge association={association} />
      {association.explanation ? (
        <p className="atlas-association__explanation">
          {association.explanation}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The section.
 *
 * It fetches the dish's atlas view itself, so it is an island: the
 * dish page stays static and fast, and the associations load when the
 * section approaches the viewport.
 */

/**
 * The styles.
 *
 * They are scoped to the class names this component owns, so they
 * cannot leak into the rest of the page.
 */
const styles = `
.atlas-places { margin: 0 0 var(--space-8, 3rem); }
.atlas-places__intro { margin: 0 0 1.25rem; max-width: 62ch; }

.atlas-group { margin: 0 0 1.5rem; }
.atlas-group__label {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sub, #6b6052);
  margin: 0 0 4px;
}
.atlas-group__note {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--sub, #6b6052);
  max-width: 60ch;
}

.atlas-associations { list-style: none; margin: 0; padding: 0; }
.atlas-association {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  align-items: baseline;
  padding: 9px 0;
  border-top: 1px solid var(--line, rgba(33, 28, 22, 0.12));
}
.atlas-association__main { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.atlas-association__name {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 18px;
  color: var(--ink, #211c16);
}
.atlas-association__meta,
.atlas-association__kind {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--sub, #6b6052);
}
.atlas-association__kind {
  border: 1px solid var(--line, rgba(33, 28, 22, 0.18));
  border-radius: 3px;
  padding: 1px 5px;
}
.atlas-association__explanation {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--sub, #6b6052);
  max-width: 68ch;
}

/* The evidence badge. A WORD, never a number — the brief forbids
   numerical confidence scores. */
.atlas-evidence {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 2px 7px;
  white-space: nowrap;
  border: 1px solid currentColor;
}
.atlas-evidence--evidenced { color: #2f6b3d; }
.atlas-evidence--provisional { color: #8a6d1f; }
.atlas-evidence--pending { color: #6b6052; }
.atlas-evidence--unevidenced { color: #8a8177; }

/* The legacy value: shown, but marked as discovery data. */
.atlas-legacy {
  margin-top: 1.5rem;
  padding: 12px 14px;
  border: 1px dashed var(--line, rgba(33, 28, 22, 0.22));
  border-radius: 6px;
  background: var(--card-soft, rgba(33, 28, 22, 0.02));
}
.atlas-legacy__label {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--ink, #211c16);
}
.atlas-legacy__warning {
  margin: 0;
  font-size: 12.5px;
  color: var(--sub, #6b6052);
  max-width: 70ch;
}

@media (max-width: 640px) {
  .atlas-association { grid-template-columns: 1fr; }
  .atlas-evidence { justify-self: start; }
}
`;

/**
 * The styles are injected once, by the component, rather than living
 * in the Astro page — the island owns its own presentation.
 */
function AtlasPlacesStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}

export default function AtlasPlaces({
  slug,
  dishName,
}: {
  slug: string;
  dishName: string;
}) {
  const [data, setData] = useState<AtlasResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    getDishAtlas(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReason(
          err instanceof ApiError
            ? `API ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown",
        );
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <section
        className="section atlas-places"
        aria-labelledby="atlas-places-heading"
      >
        <AtlasPlacesStyles />
        <h2 id="atlas-places-heading">Places &amp; traditions</h2>
        <p className="sub">Loading the associations for {dishName}…</p>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section
        className="section atlas-places"
        aria-labelledby="atlas-places-heading"
      >
        <AtlasPlacesStyles />
        <h2 id="atlas-places-heading">Places &amp; traditions</h2>
        <p className="alert alert-warning">
          The associations could not be loaded ({reason}). The dish’s own
          details below are unaffected.
        </p>
      </section>
    );
  }

  const associations = data?.placesAndTraditions ?? [];
  const legacy = data?.legacy?.origin ?? null;

  // Group the associations by the four kinds the brief names. Anything
  // that does not fall into one of them is shown under "Other
  // associations" rather than dropped — a silent drop is the defect
  // this whole project exists to fix.
  const grouped = GROUPS.map((group) => ({
    group,
    rows: associations.filter((a) => group.types.includes(a.relationship)),
  })).filter((g) => g.rows.length > 0);

  const known = new Set(GROUPS.flatMap((g) => g.types));
  const other = associations.filter((a) => !known.has(a.relationship));

  const hasNothing = grouped.length === 0 && other.length === 0;

  return (
    <section
      className="section atlas-places"
      aria-labelledby="atlas-places-heading"
    >
      <AtlasPlacesStyles />
      <h2 id="atlas-places-heading">Places &amp; traditions</h2>

      {hasNothing ? (
        <>
          <p className="sub">
            No association has been published for this dish yet.
          </p>
          {legacy ? (
            <div className="atlas-legacy">
              <p className="atlas-legacy__label">
                Associated with {legacy.name}
                {legacy.isoCode ? ` · ${legacy.isoCode}` : ""}
              </p>
              <p className="atlas-legacy__warning">{legacy.warning}</p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="sub atlas-places__intro">
            Where {dishName} is associated with, and with whom. An association
            records a connection — it does not establish that the dish was
            invented there.
          </p>

          {grouped.map(({ group, rows }) => (
            <div className="atlas-group" key={group.id}>
              <h3 className="atlas-group__label">{group.label}</h3>
              <p className="atlas-group__note">{group.note}</p>
              <ul className="atlas-associations">
                {rows.map((association) => (
                  <AssociationRow
                    key={association.id}
                    association={association}
                  />
                ))}
              </ul>
            </div>
          ))}

          {other.length > 0 ? (
            <div className="atlas-group">
              <h3 className="atlas-group__label">Other associations</h3>
              <ul className="atlas-associations">
                {other.map((association) => (
                  <AssociationRow
                    key={association.id}
                    association={association}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {legacy && !hasNothing ? (
        <div className="atlas-legacy">
          <p className="atlas-legacy__label">
            Associated with {legacy.name}
            {legacy.isoCode ? ` · ${legacy.isoCode}` : ""}
          </p>
          <p className="atlas-legacy__warning">{legacy.warning}</p>
        </div>
      ) : null}
    </section>
  );
}
