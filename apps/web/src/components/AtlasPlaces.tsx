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
import { relationshipLabel } from "../lib/dishFacts";
import {
  mayCarrySentence,
  NO_EVIDENCE_TEXT,
  publicSentence,
  type RelatedPlaceRow,
} from "../lib/publicAssociationSentence";
import type { DishOrigin } from "../types/dish";
import { DishMap } from "./DishMap";
import { EvidenceLabel } from "./EvidenceLabel";

/**
 * How long the loading state may last before the section says what
 * happened.
 *
 * Five seconds is long enough for a slow connection to answer and short
 * enough that a reader who has scrolled to the section does not think
 * the page is broken. The request is NOT aborted when this fires — a
 * late answer still renders — but the reader is not left looking at a
 * line that says "Loading" with nothing behind it.
 */
const LOAD_TIMEOUT_MS = 5000;

/**
 * How many related dishes this island will fetch places for.
 *
 * Each related dish costs one API request, so this has to be a
 * number rather than "all of them".
 */
const MAX_RELATED_PLACE_FETCHES = 6;

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
  {
    // WP-B2. The legacy import gets its OWN group, with its own
    // heading, instead of falling into "Other associations".
    //
    // "Other" is a vague word for a specific thing, and the thing here
    // is specific: these rows came from the legacy places & traditions
    // fields, no source supports them, and the 2026-11-15 blueprint
    // asks for them to be published with the label UNVERIFIED. So the
    // heading says what they are.
    //
    // It comes LAST on purpose. It is the least evidenced group, and
    // the order is presentation metadata — but a reader who meets
    // "Unverified associations" before "Historical emergence" would
    // reasonably read the page as being about unverified material.
    id: "legacy",
    label: "Unverified associations",
    types: ["legacy_unreviewed"],
    note: "Carried over from the old places and traditions list. No source supports them yet, so they are a starting point rather than a finding.",
  },
];

// The association's evidence badge.
//
// IT USED TO HAVE ITS OWN VOCABULARY. Four vocabularies were in use at
// once on this site:
//
//   the journey's  — "Documented", "Likely", "Possible", "Parallel tradition"
//   the dish page's — "unevidenced"
//   this one       — "Evidenced", "Proposed", "Being researched", "Not yet evidenced"
//   the lineages'  — six values of its own
//
// A reader could not tell that "Proposed" and "Likely" meant roughly
// the same thing, or that "Not yet evidenced" and "Unverified" were
// the same state under two names.
//
// Now all of them go through `evidenceLabel` in
// `apps/web/src/lib/evidenceLabel.ts`, and the badge is the shared
// `EvidenceLabel` component. The wording is no longer decided here.
function EvidenceBadge({ association }: { association: AtlasAssociation }) {
  return (
    <EvidenceLabel
      evidenceStatus={association.evidence.status}
      disputeState={association.evidence.dispute}
      reviewState={association.reviewState}
      subject="association"
    />
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
        <span className="atlas-association__relationship">
          {relationshipLabel(association.relationship)}
        </span>
      </div>
      <EvidenceBadge association={association} />
      {/*
        THE ONE PUBLIC SENTENCE.

        This row used to print the association's `explanation` field
        verbatim. That field is the DATABASE'S note about how the row
        got here, not a finding about the dish: the legacy import wrote
        "Migrated from the legacy origin_geo_id. This is the Wikidata
        'country of origin' value -- DISCOVERY DATA, not a reviewed
        historical claim ... preserved in legacy_value." and the cuisine
        row wrote "The cuisine '<cuisine>' has a matching tradition row
        '<tradition>'".

        A reader has no way to know that. It read as if the site were
        unsure what it was talking about, and it printed the
        unfilled placeholder tokens literally. The API no longer ships
        the field, and the page builds its own sentence from the
        relationship and the entity instead.

        BUT a sentence built from the relationship and the entity
        ALONE is a filler -- "Associated with the Greek cuisine."
        asserts nothing while reading as though it did. The brief
        asks for "an explanation from its source" and says plainly:
        "No generated filler sentence". ATLAS_STYLE agrees: an
        Unverified item is "Not written as prose. It stays a gap; the
        facts row shows 'No evidence'", and "The facts table never
        pads."

        So the sentence is rendered only when there is a finding to
        state. An unevidenced association shows the honest empty
        state instead.
      */}
      {(() => {
        const sentence = publicSentence({
          relationship: association.relationship,
          entityKind: association.entityKind,
          name: association.name,
          isoCode: association.isoCode,
          evidenceStatus: association.evidence.status,
        });
        if (sentence) {
          return <p className="atlas-association__sentence">{sentence}</p>;
        }
        return (
          <p className="atlas-association__sentence atlas-association__sentence--noevidence">
            {NO_EVIDENCE_TEXT}
          </p>
        );
      })()}
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

/* THE MAP, BESIDE THE LIST.
   The brief asks for the map beside the list. On a wide screen the two
   sit side by side, so a reader sees the picture and the claims
   together; on a narrow screen the map stacks under the list, which
   is the order the claims should be read in either way. */
.atlas-places__map {
  margin: 1.75rem 0 0;
}
@media (min-width: 60rem) {
  .atlas-places__map {
    margin: 0 0 1.5rem;
  }
}

/* The honest empty state. ATLAS_STYLE: an Unverified item is "Not
   written as prose. It stays a gap; the facts row shows 'No
   evidence'." It is set in the same muted colour as the other
   secondary lines, and in italics so it reads as a state rather than
   as a sentence about the dish. */
.atlas-association__sentence--noevidence {
  font-style: italic;
}

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
/* The relationship label: what KIND of claim this row is. It sits with
   the name, because a name on its own does not say whether the row is
   a claim about the dish's origin or a carried-over association. */
.atlas-association__relationship {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--sub, #6b6052);
  border-left: 1px solid var(--line, rgba(33, 28, 22, 0.18));
  padding-left: 8px;
}

/* The ONE public sentence. It replaced the association's explanation
   field, which held the database's migration notes and printed them
   verbatim to readers. */
.atlas-association__sentence {
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
  initialData,
  origin,
}: {
  slug: string;
  dishName: string;
  initialData?: AtlasResponse | null;
  origin?: DishOrigin | null;
}) {
  const [data, setData] = useState<AtlasResponse | null>(initialData ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    initialData ? "ready" : "loading",
  );
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (initialData) return;

    let cancelled = false;
    setState("loading");

    // THE FIVE-SECOND TIMEOUT.
    //
    // A fetch that never settles — a hung request, a service worker that
    // holds the connection open, a proxy that accepts and then goes
    // quiet — leaves this section on "Loading the associations for …"
    // FOREVER. That is the permanent loading line the 2026-11-15
    // blueprint recorded: the text did not describe a slow network, it
    // described a request that was never made.
    //
    // So the loading state is bounded. After five seconds the section
    // says what happened and offers the action. The request is NOT
    // aborted — if it answers later, the content still appears — but
    // the reader is never left staring at a spinner that will not
    // resolve.
    const timer = setTimeout(() => {
      if (cancelled) return;
      setState((current) => {
        if (current === "loading") {
          setReason("the request did not answer within 5 seconds");
          return "error";
        }
        return current;
      });
    }, LOAD_TIMEOUT_MS);

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
      clearTimeout(timer);
    };
  }, [slug, initialData]);

  /*
   * THE RELATED-PLACE HOOKS COME FIRST, ON PURPOSE.
   *
   * They used to sit BELOW the loading and error early-returns, which
   * is a rules-of-hooks violation: React renders the component, hits
   * the early return, and never runs the later hooks -- then on the
   * next render, when the state is "ready", it runs them. React sees
   * more hooks than the previous render and throws #310 ("Rendered
   * more hooks than during the previous render"), which takes the
   * whole island down.
   *
   * Every hook in this component is now above every early return.
   */

  const [relatedPlaces, setRelatedPlaces] = useState<RelatedPlaceRow[]>([]);

  /*
   * THE PLACES OF THE RELATED DISHES.

   * The brief: "Add places of related dishes, taken from
   * `dish_relations` and marked as such: 'Turkey - home of a related
   * dish, musakka'."

   * The related dish's place is NOT on this payload -- the connection
   * carries only the other dish's slug and name. So the island asks
   * the API for each related dish's atlas view and reads the places
   * from there.

   * It is deliberately NOT a second kind of association. An
   * association says something about THIS dish and a place. This says
   * something about ANOTHER dish and a place, reached through the
   * relation, so it is labelled as a relation and never as an
   * association of this dish.

   * The fetch is best-effort and CAPPED: a related dish whose atlas
   * view does not answer simply contributes no rows, and no more than
   * `MAX_RELATED_PLACE_FETCHES` dishes are asked for. The related
   * dish's place must ALSO pass the same evidence gate as every other
   * place on the page -- an unevidenced row is a gap, and a gap is
   * shown as one rather than quietly promoted into a fact.
   */
  useEffect(() => {
    if (state !== "ready" || !data) return;

    const related = data.historyAndConnections?.connections ?? [];

    // THE RELATIONSHIP IS GATED TOO -- ON WHAT IT ACTUALLY CARRIES.
    //
    // The related dish's PLACE passes the evidence gate. So does the
    // CONNECTION that says this dish and that one are related at
    // all: a row that says "Turkey is where <dish> is associated"
    // rests on that relation, so an unjustified relation would be
    // printed as a fact.
    //
    // BUT A CONNECTION HAS NO EVIDENCE STATUS. Its `status` field is
    // "active" -- a row-lifecycle flag, not a state of knowledge --
    // and gating on it with the evidence allowlist would match
    // nothing and silently empty the whole section. The thing that
    // actually justifies a connection is its `reason`: the
    // human-written sentence saying WHY these two are related.
    //
    // So the gate is the reason. A connection with no reason is a
    // relation the site cannot state, and it is withheld.
    //
    // Gating BEFORE the slice also saves the requests: there is no
    // point fetching the atlas view of a dish whose relationship to
    // this one cannot be stated.
    const evidencedConnections = related.filter(
      (c) => typeof c.reason === "string" && c.reason.trim().length > 0,
    );

    // CAPPED. This fires one request per connection, so an
    // unbounded list would be an unbounded number of requests
    // on a page load. The connections are already ordered by
    // the API's own relevance, so the first few are the ones
    // worth showing.
    const slugs = Array.from(
      new Set(
        evidencedConnections
          .map((c) => c.other?.slug)
          .filter((s): s is string => typeof s === "string" && s.length > 0),
      ),
    ).slice(0, MAX_RELATED_PLACE_FETCHES);
    if (slugs.length === 0) return;

    // THE RELATED DISH'S NAME.
    //
    // The name comes from THIS dish's connections -- the payload
    // already carries it. It used to be looked up in the RELATED
    // dish's own connections for an entry naming itself, which a
    // dish never does, so the lookup always missed and the row fell
    // back to the raw slug: "Turkey is where musakka-turkish is
    // associated." A slug in a sentence is not a name.
    const nameBySlug = new Map(
      evidencedConnections
        .filter((c) => typeof c.other?.slug === "string")
        .map((c) => [c.other!.slug, c.other!.name]),
    );

    let cancelled = false;

    Promise.all(
      slugs.map(async (relatedSlug) => {
        try {
          const view = await getDishAtlas(relatedSlug);
          // The SAME evidence gate the main list uses. A
          // related dish's place is only shown when it is
          // actually evidenced -- `reviewState !== "rejected"`
          // alone lets `unevidenced` discovery rows through,
          // which is the gap the page is supposed to show
          // rather than hide.
          const places = (view.placesAndTraditions ?? []).filter(
            (a) =>
              a.entityKind === "place" &&
              a.isoCode &&
              a.reviewState !== "rejected" &&
              mayCarrySentence(a.evidence?.status),
          );
          return {
            slug: relatedSlug,
            places,
            connectionName: nameBySlug.get(relatedSlug) ?? "a related dish",
          };
        } catch {
          return {
            slug: relatedSlug,
            places: [],
            connectionName: nameBySlug.get(relatedSlug) ?? "a related dish",
          };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const rows: RelatedPlaceRow[] = [];
      for (const res of results) {
        for (const place of res.places) {
          rows.push({
            key: `${res.slug}:${place.id}`,
            place: place.name ?? "",
            relationLabel: "Related dish",
            dishName: res.connectionName,
          });
        }
      }
      setRelatedPlaces(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [data, state]);
  if (state === "loading") {
    return (
      <div className="section atlas-places">
        <AtlasPlacesStyles />
        <p className="sub">Loading the associations for {dishName}…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="section atlas-places">
        <AtlasPlacesStyles />
        <p className="alert alert-warning">
          This part did not load ({reason}). The dish’s own details below are
          unaffected.
        </p>
        {/* The blueprint's error state: say what happened, then give the
            reader the one action that can change it. A section that
            only says it failed leaves the reader with nothing to do. */}
        <p>
          <button
            type="button"
            className="btn-accent"
            onClick={() => {
              setData(null);
              setReason("");
              setState("loading");
            }}
          >
            Retry
          </button>
        </p>
      </div>
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

  // GREECE IS SHOWN ONCE.
  //
  // The legacy origin block and the association list are the SAME fact
  // for a dish whose legacy origin was migrated into the atlas: the
  // migration wrote the legacy `origin_geo_id` into an association row
  // AND left the legacy block in place. The page then printed "Greece"
  // in the list and, again, in a separate "Associated with Greece" box
  // underneath it.
  //
  // The list wins, because it is the one that carries the relationship
  // and the evidence label. The legacy block is only worth its space
  // when the list does NOT already name the place -- which is the case
  // for a dish with no associations at all.
  const legacyAlreadyShown =
    legacy !== null &&
    associations.some(
      (a) =>
        a.entityKind === "place" &&
        (a.name === legacy.name ||
          (legacy.isoCode !== null &&
            a.isoCode !== null &&
            a.isoCode.toUpperCase() === legacy.isoCode.toUpperCase())),
    );

  return (
    <div className="section atlas-places">
      <AtlasPlacesStyles />

      {hasNothing ? (
        <>
          {/* THE EMPTY STATE.
              A successful response with zero associations is NOT a
              failure and NOT a blank space. It says what is missing and
              what the reader has instead.

              The blueprint's wording is: "No reviewed place associations
              yet. Commonly associated with <legacy origin name>, not yet
              verified." The legacy origin is discovery data, so it is
              named as a common association and marked as not verified —
              never as an origin, and never as a claim. */}
          <p className="sub">
            {legacy
              ? `No reviewed place associations yet. Commonly associated with ${legacy.name}, not yet verified.`
              : "No reviewed place associations yet."}
          </p>
          {legacy && !legacyAlreadyShown ? (
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
            Where {dishName} is associated, and with what. An association
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

      {legacy && !hasNothing && !legacyAlreadyShown ? (
        <div className="atlas-legacy">
          <p className="atlas-legacy__label">
            Associated with {legacy.name}
            {legacy.isoCode ? ` · ${legacy.isoCode}` : ""}
          </p>
          <p className="atlas-legacy__warning">{legacy.warning}</p>
        </div>
      ) : null}

      {/*
        THE MAP, BESIDE THE LIST.

        The brief asks for the map beside the list, and for the map to
        be fitted to EVERY place listed -- not one country at 300 km.
        The old layout put the map in its own section further down the
        page, centred on the legacy origin, so a reader scrolling the
        list could not see the picture at all, and a country-scale
        zoom made a single marker look like the whole claim.

        The map is the MAP OF THE ASSOCIATED PLACE, not a claim that
        the dish was invented there. It stays after the associations so
        the reader meets the claims before the picture.
      */}
      {origin && origin.lat !== null && origin.lng !== null ? (
        <div className="atlas-places__map">
          {/*
            THE MAP DRAWS THE LEGACY ORIGIN -- DISCOVERY DATA.

            `origin` is the dish's legacy Wikidata value, which the
            API marks `isDiscoveryData: true` and warns is "not a
            reviewed historical claim". The map is passed
            `isReviewed={false}` so it labels the place as associated
            and discloses that it is unverified, instead of letting a
            pin under the heading "Where it belongs" read as a
            reviewed claim about where the dish was invented.
          */}
          <DishMap origin={origin} dishName={dishName} isReviewed={false} />
        </div>
      ) : null}

      {/*
        PLACES OF RELATED DISHES.

        The brief: "Add places of related dishes, taken from
        `dish_relations` and marked as such: 'Turkey - home of a
        related dish, musakka'."

        This is deliberately a DIFFERENT kind of row from the
        associations above. An association says something about THIS
        dish and a place. This says something about ANOTHER dish and a
        place -- the place is that other dish's association, and this
        dish only reaches it through the relation. So it is labelled
        as a relation, never as an association of this dish.

        The connections carry the related dish's slug and name; the
        related dish's OWN places are not on this page's payload, so
        the island asks the API for each related dish's atlas view and
        reads the places from there.

        A row appears only when BOTH halves are in order: the
        relation carries a reason (so the site can say why these two
        are related), and the related dish's place passes the same
        evidence gate as every other place on the page. The section
        is absent when there is nothing to show -- an honest absence
        rather than a guess.
      */}
      {relatedPlaces.length > 0 ? (
        <div className="atlas-group atlas-group--related">
          <h3 className="atlas-group__label">Places of related dishes</h3>
          <ul className="atlas-associations">
            {relatedPlaces.map((row) => (
              <li className="atlas-association" key={row.key}>
                <div className="atlas-association__main">
                  <span className="atlas-association__name">{row.place}</span>
                  <span className="atlas-association__relationship">
                    {row.relationLabel}
                  </span>
                </div>
                <p className="atlas-association__sentence">
                  {row.place} is where {row.dishName} is associated.
                </p>
                {/*
                  The wording is the brief's: "Turkey - home of a
                  related dish, musakka". It says "associated", never
                  "invented" or "origin", because the place is where
                  the OTHER dish is associated -- this dish only
                  reaches it through the relation.
                */}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
